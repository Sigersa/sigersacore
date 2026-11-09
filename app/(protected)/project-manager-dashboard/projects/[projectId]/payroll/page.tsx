'use client';

import AppHeader from '@/components/header/3/3.1';
import Footer from '@/components/footer';
import { useSessionManager } from '@/hooks/useSessionManager/3';
import { useInactivityManager } from '@/hooks/useInactivityManager';
import { useUploadThing } from '@/lib/uploadthing';
import { useState, useEffect, useCallback, useRef, FormEvent, ChangeEvent, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Edit, Trash2, X, RefreshCw, CheckCircle, AlertCircle,
  Download, Plus, ChevronDown, ChevronRight, CalendarDays, Users,
  Lock, Unlock, BadgeDollarSign, Banknote, Upload, FileText,
  Image as ImageIcon, FileSpreadsheet
} from 'lucide-react';

// ------------------ INTERFACES ------------------

interface UserData {
  id: number;
  usuario: string;
  tipoUsuario: string;
  nombre: string;
  apellido: string;
  email: string;
  proyectoAsignado: string;
  proyectoActivo: boolean;
  projectId: number | null;
}

interface Worker {
  ProjectPersonnelID: number | null;
  AssignmentID: number | null;
  EmployeeID: number;
  Source: 'PROJECT' | 'BASE';
  FullName: string;
  Position?: string | null;
  SalaryIMSS?: number | null;
}

type Shift = 'DIA' | 'NOCHE';

interface PayrollPeriod {
  PayrollPeriodID: number;
  ProjectID: number;
  WeekNumber: number;
  StartDate: string;
  EndDate: string;
  Status: number;
  TotalWeek: number;
  TotalRegularHours: number;
  TotalExtraHours: number;
  TotalEntries: number;
  Total: number | null;
  PayrollStatus: number | null;
  Archivos?: string | null;
  MethodID?: number | null;
  MethodName?: string | null;
}

interface PaymentMethod {
  methodId: number;
  methodName: string;
}

interface PayrollEntry {
  EntryID: number;
  PayrollPeriodID: number;
  ProjectPersonnelID: number | null;
  AssignmentID: number | null;
  Source: 'PROJECT' | 'BASE';
  WorkDate: string;
  Shift: Shift;
  RegularHours: number;
  ExtraHours: number;
  DiasViaticos: number;
  RegularAmount?: number;
  ExtraAmount?: number;
  TotalAmount?: number;
  WorkerName?: string;
  WorkerPosition?: string;
  Salary?: number | null;
}

interface ViaticoRow {
  ViaticoID?: number;
  PayrollPeriodID: number;
  ProjectPersonnelID: number | null;
  AssignmentID: number | null;
  Source: 'PROJECT' | 'BASE';
  DiasViaticos: number;
  FullName: string;
}

interface InfonavitRow {
  InfonavitID?: number;
  EmployeeID: number;
  DailyAmount: number;
  FullName: string;
}

interface LoanPaymentRow {
  PaymentID: number;
  LoansID: number;
  PaymentNumber: number;
  Amount: number;
  Status: number;
  PaymentDate: string | null;
  PayrollPeriodID: number;
  LoanTotal: number;
  NumberOfPayments: number;
  ProjectPersonnelID: number;
  EmployeeName: string;
  CuotasPagadas: number;
  TotalCuotas: number;
  Progreso: string;
}

interface ArchivoAdjunto {
  nombre: string;
  url: string;
  tipo: string;
  key: string;
}

interface EntryFormData {
  Source: 'PROJECT' | 'BASE';
  ProjectPersonnelID: string;
  AssignmentID: string;
  WorkDate: string;
  Shift: Shift;
  RegularHours: string;
  ExtraHours: string;
}

interface ViaticoFormData {
  Source: 'PROJECT' | 'BASE';
  ProjectPersonnelID: string;
  AssignmentID: string;
  DiasViaticos: string;
}

interface InfonavitFormData {
  Source: 'PROJECT' | 'BASE';
  ProjectPersonnelID: string;
  AssignmentID: string;
  DailyAmount: string;
}

interface PageProps {
  params: Promise<{ projectId: string }>;
}

// ------------------ HELPERS ------------------

const formatCurrencyNumber = (amount: number): string => {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 2
    }).format(amount);
  } catch { return `$${amount.toFixed(2)}`; }
};

const formatDate = (dateString: string): string => {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('es-MX', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'
    });
  } catch { return dateString; }
};

const formatDateInput = (dateString: string): string => {
  if (!dateString) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
};

const getDayLetter = (dateString: string) => {
  const days = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const d = new Date(dateString);
  const utcDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return days[utcDate.getDay()];
};

const workerKey = (w: Worker) =>
  w.Source === 'BASE' ? `BASE-${w.AssignmentID}` : `PROJECT-${w.ProjectPersonnelID}`;

const workerFromKey = (workers: Worker[], key: string) =>
  workers.find(w => workerKey(w) === key) || null;

const findWorkerForEntry = (workers: Worker[], entry: PayrollEntry | ViaticoRow) =>
  workers.find(w =>
    entry.Source === 'BASE'
      ? w.Source === 'BASE' && w.AssignmentID === entry.AssignmentID
      : w.Source === 'PROJECT' && w.ProjectPersonnelID === entry.ProjectPersonnelID
  );

const validateFiles = (files: File[]): { valid: boolean; message: string } => {
  const MAX_FILE_SIZE = 4 * 1024 * 1024;
  const MAX_FILE_COUNT = 3;
  const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (files.length > MAX_FILE_COUNT) {
    return { valid: false, message: `No puedes subir más de ${MAX_FILE_COUNT} archivos a la vez.` };
  }

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, message: `Tipo de archivo no permitido: ${file.name}. Solo se permiten PDF, imágenes (JPG/PNG) y archivos de Excel.` };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, message: `El archivo ${file.name} excede el tamaño máximo de 4MB.` };
    }
  }

  return { valid: true, message: '' };
};

const parseArchivos = (raw: string | null | undefined): ArchivoAdjunto[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
};

function FileIcon({ type, size = 5 }: { type: string; size?: number }) {
  const iconClass = `h-${size} w-${size}`;

  if (type?.startsWith('image/')) {
    return <ImageIcon className={`${iconClass} text-blue-500`} />;
  } else if (type === 'application/pdf') {
    return <FileText className={`${iconClass} text-red-500`} />;
  } else if (type?.includes('excel') || type?.includes('spreadsheet')) {
    return <FileSpreadsheet className={`${iconClass} text-green-500`} />;
  } else {
    return <FileText className={`${iconClass} text-gray-500`} />;
  }
}

// ------------------ MODAL GENÉRICO ------------------
// z-index alto para que SIEMPRE esté por encima de los demás modales

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, message, type = 'info' }) => {
  if (!isOpen) return null;
  const getIcon = () => {
    if (type === 'success') return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (type === 'error') return <AlertCircle className="h-5 w-5 text-red-600" />;
    return <AlertCircle className="h-5 w-5 text-blue-600" />;
  };
  const getBg = () => {
    if (type === 'success') return 'bg-green-100';
    if (type === 'error') return 'bg-red-100';
    return 'bg-blue-100';
  };
  return (
    <div className="fixed inset-0 flex items-center justify-center z-[999999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[1000000]">
        <div className="p-6">
          <div className="flex items-center space-x-3">
            <div className={`flex items-center justify-center w-10 h-10 ${getBg()} rounded-full flex-shrink-0`}>{getIcon()}</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h3>
              <p className="mt-1 text-sm text-gray-600 leading-5">{message}</p>
            </div>
            <button onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-500 transition-colors duration-200 bg-gray-100 hover:bg-gray-200 rounded-full p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors">
              ACEPTAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------ MODAL ENTRADA DIARIA ------------------

interface EntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EntryFormData) => void;
  workers: Worker[];
  initialData?: EntryFormData | null;
  isSaving: boolean;
  weekStart: string;
  weekEnd: string;
  mode: 'create' | 'edit';
}

const EntryModal: React.FC<EntryModalProps> = ({
  isOpen, onClose, onSave, workers, initialData, isSaving, weekStart, weekEnd, mode
}) => {
  const [form, setForm] = useState<EntryFormData>({
    Source: 'PROJECT',
    ProjectPersonnelID: '',
    AssignmentID: '',
    WorkDate: weekStart,
    Shift: 'DIA',
    RegularHours: '8',
    ExtraHours: '0'
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFormError('');
      if (initialData) setForm(initialData);
      else {
        const first = workers[0];
        setForm({
          Source: first?.Source || 'PROJECT',
          ProjectPersonnelID: first?.Source === 'PROJECT' ? String(first.ProjectPersonnelID) : '',
          AssignmentID: first?.Source === 'BASE' ? String(first.AssignmentID) : '',
          WorkDate: weekStart,
          Shift: 'DIA',
          RegularHours: '8',
          ExtraHours: '0'
        });
      }
    }
  }, [isOpen, initialData, workers, weekStart]);

  if (!isOpen) return null;

  const handleWorkerSelect = (key: string) => {
    const w = workerFromKey(workers, key);
    if (!w) return;
    setFormError('');
    setForm(prev => ({
      ...prev,
      Source: w.Source,
      ProjectPersonnelID: w.Source === 'PROJECT' ? String(w.ProjectPersonnelID) : '',
      AssignmentID: w.Source === 'BASE' ? String(w.AssignmentID) : ''
    }));
  };

  const selectedKey = form.Source === 'BASE'
    ? `BASE-${form.AssignmentID}`
    : `PROJECT-${form.ProjectPersonnelID}`;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedKey || selectedKey === 'PROJECT-' || selectedKey === 'BASE-') {
      setFormError('Debes seleccionar un trabajador.');
      return;
    }
    if (!form.WorkDate) {
      setFormError('La fecha es obligatoria.');
      return;
    }
    if (form.WorkDate < weekStart || form.WorkDate > weekEnd) {
      setFormError('La fecha debe estar dentro de la semana seleccionada.');
      return;
    }
    const rh = Number(form.RegularHours);
    const eh = Number(form.ExtraHours);
    if (isNaN(rh) || rh < 0 || rh > 24) {
      setFormError('Las horas normales deben ser un número entre 0 y 24.');
      return;
    }
    if (isNaN(eh) || eh < 0 || eh > 24) {
      setFormError('Las horas extra deben ser un número entre 0 y 24.');
      return;
    }
    setFormError('');
    onSave(form);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">
              {mode === 'create' ? 'NUEVO REGISTRO DE NÓMINA' : 'EDITAR REGISTRO'}
            </h2>
            <p className="text-gray-600 mt-1 text-sm">
              Semana: {formatDate(weekStart)} - {formatDate(weekEnd)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {formError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 animate-fade-in">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0" />
                <p className="text-xs font-medium text-red-700 leading-5">{formError}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
                INFORMACIÓN DEL REGISTRO
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">TRABAJADOR *</label>
                  <select
                    value={selectedKey}
                    onChange={(e) => handleWorkerSelect(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                    required
                  >
                    <option value="">SELECCIONA UN TRABAJADOR</option>
                    {workers.map(w => (
                      <option key={workerKey(w)} value={workerKey(w)}>
                        {w.FullName}{w.Position ? ` — ${w.Position}` : ''} {w.Source === 'BASE' ? ' (BASE)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">FECHA *</label>
                  <input
                    type="date"
                    value={form.WorkDate}
                    min={weekStart}
                    max={weekEnd}
                    onChange={(e) => { setFormError(''); setForm(prev => ({ ...prev, WorkDate: e.target.value })); }}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">TURNO *</label>
                  <select
                    value={form.Shift}
                    onChange={(e) => setForm(prev => ({ ...prev, Shift: e.target.value as Shift }))}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                    required
                  >
                    <option value="DIA">DÍA</option>
                    <option value="NOCHE">NOCHE</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
                HORAS
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">HORAS NORMALES *</label>
                  <input
                    type="number" step="0.25" min="0" max="24"
                    value={form.RegularHours}
                    onChange={(e) => { setFormError(''); setForm(prev => ({ ...prev, RegularHours: e.target.value })); }}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">HORAS EXTRA *</label>
                  <input
                    type="number" step="0.25" min="0" max="24"
                    value={form.ExtraHours}
                    onChange={(e) => { setFormError(''); setForm(prev => ({ ...prev, ExtraHours: e.target.value })); }}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-300 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50">CANCELAR</button>
            <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors disabled:opacity-50 flex items-center justify-center min-w-[140px]">
              {isSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>GUARDANDO...</>) : 'GUARDAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ------------------ MODAL VIÁTICOS ------------------

interface ViaticoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ViaticoFormData) => void;
  workers: Worker[];
  isSaving: boolean;
  weekStart: string;
  weekEnd: string;
  viaticosActuales: ViaticoRow[];
}

const ViaticoModal: React.FC<ViaticoModalProps> = ({
  isOpen, onClose, onSave, workers, isSaving, weekStart, weekEnd, viaticosActuales
}) => {
  const [form, setForm] = useState<ViaticoFormData>({
    Source: 'PROJECT', ProjectPersonnelID: '', AssignmentID: '', DiasViaticos: '0'
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFormError('');
      const first = workers[0];
      if (!first) {
        setForm({ Source: 'PROJECT', ProjectPersonnelID: '', AssignmentID: '', DiasViaticos: '0' });
        return;
      }
      const existing = viaticosActuales.find(v =>
        first.Source === 'BASE'
          ? v.AssignmentID === first.AssignmentID
          : v.ProjectPersonnelID === first.ProjectPersonnelID
      );
      setForm({
        Source: first.Source,
        ProjectPersonnelID: first.Source === 'PROJECT' ? String(first.ProjectPersonnelID) : '',
        AssignmentID: first.Source === 'BASE' ? String(first.AssignmentID) : '',
        DiasViaticos: existing ? String(existing.DiasViaticos) : '0'
      });
    }
  }, [isOpen, workers, viaticosActuales]);

  if (!isOpen) return null;

  const handleWorkerChange = (key: string) => {
    const w = workerFromKey(workers, key);
    if (!w) return;
    setFormError('');
    const existing = viaticosActuales.find(v =>
      w.Source === 'BASE'
        ? v.AssignmentID === w.AssignmentID
        : v.ProjectPersonnelID === w.ProjectPersonnelID
    );
    setForm({
      Source: w.Source,
      ProjectPersonnelID: w.Source === 'PROJECT' ? String(w.ProjectPersonnelID) : '',
      AssignmentID: w.Source === 'BASE' ? String(w.AssignmentID) : '',
      DiasViaticos: existing ? String(existing.DiasViaticos) : '0'
    });
  };

  const selectedKey = form.Source === 'BASE'
    ? `BASE-${form.AssignmentID}`
    : `PROJECT-${form.ProjectPersonnelID}`;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedKey || selectedKey === 'PROJECT-' || selectedKey === 'BASE-') {
      setFormError('Debes seleccionar un trabajador.');
      return;
    }
    const d = Number(form.DiasViaticos);
    if (isNaN(d) || d < 0 || d > 7) {
      setFormError('Los días de viáticos deben ser un número entre 0 y 7.');
      return;
    }
    setFormError('');
    onSave(form);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">VIÁTICOS POR EMPLEADO</h2>
            <p className="text-gray-600 mt-1 text-sm">Semana: {formatDate(weekStart)} - {formatDate(weekEnd)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {formError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 animate-fade-in">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0" />
                <p className="text-xs font-medium text-red-700 leading-5">{formError}</p>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
              INFORMACIÓN DEL REGISTRO
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">TRABAJADOR *</label>
                <select
                  value={selectedKey}
                  onChange={(e) => handleWorkerChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                >
                  <option value="">SELECCIONA UN TRABAJADOR</option>
                  {workers.map(w => (
                    <option key={workerKey(w)} value={workerKey(w)}>
                      {w.FullName}{w.Position ? ` — ${w.Position}` : ''} {w.Source === 'BASE' ? ' (BASE)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">DÍAS VIÁTICOS (0-7) *</label>
                <input
                  type="number" step="0.5" min="0" max="7"
                  value={form.DiasViaticos}
                  onChange={(e) => { setFormError(''); setForm(prev => ({ ...prev, DiasViaticos: e.target.value })); }}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-300 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50">CANCELAR</button>
            <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors disabled:opacity-50 flex items-center justify-center min-w-[140px]">
              {isSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>GUARDANDO...</>) : 'GUARDAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ------------------ MODAL INFONAVIT ------------------

interface InfonavitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: InfonavitFormData) => void;
  workers: Worker[];
  isSaving: boolean;
  infonavitActuales: InfonavitRow[];
}

const InfonavitModal: React.FC<InfonavitModalProps> = ({
  isOpen, onClose, onSave, workers, isSaving, infonavitActuales
}) => {
  const [form, setForm] = useState<InfonavitFormData>({
    Source: 'PROJECT', ProjectPersonnelID: '', AssignmentID: '', DailyAmount: '0'
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFormError('');
      const first = workers[0];
      if (!first) {
        setForm({ Source: 'PROJECT', ProjectPersonnelID: '', AssignmentID: '', DailyAmount: '0' });
        return;
      }
      const existing = infonavitActuales.find(i => i.EmployeeID === first.EmployeeID);
      setForm({
        Source: first.Source,
        ProjectPersonnelID: first.Source === 'PROJECT' ? String(first.ProjectPersonnelID) : '',
        AssignmentID: first.Source === 'BASE' ? String(first.AssignmentID) : '',
        DailyAmount: existing ? String(existing.DailyAmount) : '0'
      });
    }
  }, [isOpen, workers, infonavitActuales]);

  if (!isOpen) return null;

  const handleWorkerChange = (key: string) => {
    const w = workerFromKey(workers, key);
    if (!w) return;
    setFormError('');
    const existing = infonavitActuales.find(i => i.EmployeeID === w.EmployeeID);
    setForm({
      Source: w.Source,
      ProjectPersonnelID: w.Source === 'PROJECT' ? String(w.ProjectPersonnelID) : '',
      AssignmentID: w.Source === 'BASE' ? String(w.AssignmentID) : '',
      DailyAmount: existing ? String(existing.DailyAmount) : '0'
    });
  };

  const selectedKey = form.Source === 'BASE'
    ? `BASE-${form.AssignmentID}`
    : `PROJECT-${form.ProjectPersonnelID}`;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedKey || selectedKey === 'PROJECT-' || selectedKey === 'BASE-') {
      setFormError('Debes seleccionar un trabajador.');
      return;
    }
    const amt = Number(form.DailyAmount);
    if (isNaN(amt) || amt < 0) {
      setFormError('El monto diario debe ser un número mayor o igual a 0.');
      return;
    }
    setFormError('');
    onSave(form);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">REGISTRO DE INFONAVIT</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {formError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 animate-fade-in">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0" />
                <p className="text-xs font-medium text-red-700 leading-5">{formError}</p>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
              INFORMACIÓN DEL REGISTRO
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">TRABAJADOR *</label>
                <select
                  value={selectedKey}
                  onChange={(e) => handleWorkerChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                >
                  <option value="">SELECCIONA UN TRABAJADOR</option>
                  {workers.map(w => (
                    <option key={workerKey(w)} value={workerKey(w)}>
                      {w.FullName}{w.Position ? ` — ${w.Position}` : ''} {w.Source === 'BASE' ? ' (BASE)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">MONTO DIARIO INFONAVIT ($) *</label>
                <input
                  type="number" step="0.01" min="0"
                  value={form.DailyAmount}
                  onChange={(e) => { setFormError(''); setForm(prev => ({ ...prev, DailyAmount: e.target.value })); }}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-300 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50">CANCELAR</button>
            <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors disabled:opacity-50 flex items-center justify-center min-w-[140px]">
              {isSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>GUARDANDO...</>) : 'GUARDAR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ------------------ MODAL PRÉSTAMOS (DESCUENTOS) ------------------

interface LoanDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  weekLabel: string;
  payments: LoanPaymentRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: (select: boolean) => void;
  onApply: () => void;
  isLoading: boolean;
  isApplying: boolean;
}

const LoanDiscountModal: React.FC<LoanDiscountModalProps> = ({
  isOpen, onClose, weekLabel, payments, selected, onToggle, onSelectAll,
  onApply, isLoading, isApplying
}) => {
  if (!isOpen) return null;

  const pending = payments.filter(p => p.Status !== 1);
  const allSelected = pending.length > 0 && pending.every(p => selected.has(p.PaymentID));
  const totalSelected = payments
    .filter(p => selected.has(p.PaymentID))
    .reduce((sum, p) => sum + p.Amount, 0);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
              DESCUENTOS DE PRÉSTAMOS
            </h2>
            <p className="text-gray-600 mt-1 text-sm">Semana: {weekLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3a6ea5]"></div>
            </div>
          ) : payments.length === 0 ? (
            <div className="py-8 text-center">
              <p className="mt-2 text-sm text-gray-500">No hay cuotas de préstamos en esta semana.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto mb-4">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-2 px-3 text-center text-xs font-bold text-gray-700 uppercase w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          disabled={pending.length === 0}
                          onChange={(e) => onSelectAll(e.target.checked)}
                        />
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-bold text-gray-700 uppercase border-b border-gray-300">EMPLEADO</th>
                      <th className="py-3 px-3 text-center text-xs font-bold text-gray-700 uppercase border-b border-gray-300">CUOTA</th>
                      <th className="py-3 px-3 text-right text-xs font-bold text-gray-700 uppercase border-b border-gray-300">MONTO</th>
                      <th className="py-3 px-3 text-center text-xs font-bold text-gray-700 uppercase border-b border-gray-300">PROGRESO</th>
                      <th className="py-3 px-3 text-center text-xs font-bold text-gray-700 uppercase border-b border-gray-300">STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => {
                      const isPaid = p.Status === 1;
                      return (
                        <tr key={p.PaymentID} className={`border-b border-gray-300 transition-colors ${isPaid ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={selected.has(p.PaymentID)}
                              disabled={isPaid}
                              onChange={() => onToggle(p.PaymentID)}
                            />
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-800 font-medium uppercase">{p.EmployeeName}</td>
                          <td className="py-3 px-3 text-sm text-gray-700 text-center">
                            {p.PaymentNumber} de {p.NumberOfPayments}
                          </td>
                          <td className="py-3 px-3 text-sm text-gray-800 text-right font-semibold">
                            {formatCurrencyNumber(p.Amount)}
                          </td>
                          <td className="py-3 px-3 text-center text-xs text-gray-600">{p.Progreso}</td>
                          <td className="py-3 px-3 text-center">
                            {isPaid ? (
                              <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">
                                PAGADO
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
                                PENDIENTE
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 pt-4 border-t border-gray-300">
                <p className="text-sm text-gray-600">
                  {selected.size} cuota(s) seleccionada(s) — Total a descontar:{' '}
                  <strong className="text-[#3a6ea5]">{formatCurrencyNumber(totalSelected)}</strong>
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={isApplying}
                    className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                  >
                    CANCELAR
                  </button>
                  <button
                    onClick={onApply}
                    disabled={isApplying || selected.size === 0}
                    className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center min-w-[180px] justify-center"
                  >
                    {isApplying ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>APLICANDO...</>
                    ) : (
                      'APLICAR DESCUENTOS'
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ------------------ MODAL DE EDICIÓN DE REGISTROS AGRUPADOS ------------------

interface DayEntriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workerName: string;
  entries: PayrollEntry[];
  onEdit: (entry: PayrollEntry) => void;
  onDelete: (entry: PayrollEntry) => void;
  isClosed: boolean;
}

const DayEntriesModal: React.FC<DayEntriesModalProps> = ({ isOpen, onClose, workerName, entries, onEdit, onDelete, isClosed }) => {
  if (!isOpen) return null;

  const sortedEntries = [...entries].sort((a, b) => new Date(a.WorkDate).getTime() - new Date(b.WorkDate).getTime());

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full animate-fade-in relative z-[10000] max-h-[90vh] flex flex-col">
        <div className="p-6 pb-4 border-b border-gray-300 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">REGISTROS DE LA SEMANA</h3>
            <p className="text-sm text-gray-600 font-medium mt-1">{workerName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">Día</th>
                <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">Turno</th>
                <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">H. Norm</th>
                <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">H. Extra</th>
                <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map(e => (
                <tr key={e.EntryID} className="border-b border-gray-300 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-800">{formatDate(e.WorkDate)}</td>
                  <td className="py-3 px-4 text-sm text-gray-800">{e.Shift}</td>
                  <td className="py-3 px-4 text-sm text-gray-800">{e.RegularHours}</td>
                  <td className="py-3 px-4 text-sm text-gray-800">{e.ExtraHours > 0 ? e.ExtraHours : '0'}</td>
                  <td className="py-3 px-4">
                    {!isClosed && (
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { onClose(); onEdit(e); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Editar"><Edit className="h-4 w-4" /></button>
                        <button onClick={() => { onClose(); onDelete(e); }} className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-6 pt-4 border-t border-gray-300 flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors">
            CERRAR
          </button>
        </div>
      </div>
    </div>
  );
};


// ------------------ PÁGINA ------------------

export default function PayrollPage({ params }: PageProps) {
  const router = useRouter();
  const { projectId } = use(params);

  const { user, loading: sessionLoading } = useSessionManager();
  useInactivityManager();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingViatico, setIsSavingViatico] = useState(false);
  const [isSavingInfonavit, setIsSavingInfonavit] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entriesByPeriod, setEntriesByPeriod] = useState<Record<number, PayrollEntry[]>>({});
  const [viaticosByPeriod, setViaticosByPeriod] = useState<Record<number, ViaticoRow[]>>({});
  const [infonavitList, setInfonavitList] = useState<InfonavitRow[]>([]);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set());
  const [suggestedNext, setSuggestedNext] = useState<{ startDate: string; endDate: string } | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);

  // NUEVO: Métodos de pago
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

  // Estados de préstamos
  const [loanModal, setLoanModal] = useState<{
    isOpen: boolean;
    periodId: number | null;
    weekLabel: string;
  }>({ isOpen: false, periodId: null, weekLabel: '' });
  const [loanPayments, setLoanPayments] = useState<LoanPaymentRow[]>([]);
  const [isLoadingLoanPayments, setIsLoadingLoanPayments] = useState(false);
  const [isApplyingDiscounts, setIsApplyingDiscounts] = useState(false);
  const [selectedLoanPayments, setSelectedLoanPayments] = useState<Set<number>>(new Set());
  const [loanCountByPeriod, setLoanCountByPeriod] = useState<Record<number, number>>({});

  // Estado para el modal de registros agrupados
  const [dayModal, setDayModal] = useState<{
    isOpen: boolean;
    workerName: string;
    entries: PayrollEntry[];
    isClosed: boolean;
  }>({ isOpen: false, workerName: '', entries: [], isClosed: false });

  // MODIFICADO: se agrega formError al closeWeekModal
  const [closeWeekModal, setCloseWeekModal] = useState<{
    isOpen: boolean;
    period: PayrollPeriod | null;
    total: string;
    methodId: string;
    isClosing: boolean;
    archivos: File[];
    archivosExistentes: ArchivoAdjunto[];
    filesToDelete: string[];
    isUploading: boolean;
    formError: string;
  }>({
    isOpen: false,
    period: null,
    total: '',
    methodId: '',
    isClosing: false,
    archivos: [],
    archivosExistentes: [],
    filesToDelete: [],
    isUploading: false,
    formError: ''
  });

  const closeWeekFileInputRef = useRef<HTMLInputElement>(null);

  // Estado para el modal de REABRIR semana
  const [reopenWeekModal, setReopenWeekModal] = useState<{
    isOpen: boolean;
    period: PayrollPeriod | null;
    isReopening: boolean;
  }>({ isOpen: false, period: null, isReopening: false });

  // Estado para el modal de eliminar semana
  const [deleteWeekModal, setDeleteWeekModal] = useState<{
    isOpen: boolean;
    period: PayrollPeriod | null;
    isDeleting: boolean;
  }>({ isOpen: false, period: null, isDeleting: false });

  const [userData, setUserData] = useState<UserData>({
    id: 0, usuario: '', tipoUsuario: '', nombre: '', apellido: '', email: '',
    proyectoAsignado: '', proyectoActivo: false, projectId: null
  });

  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });
  const closeModal = () => { setModal({ isOpen: false, title: '', message: '', type: 'info' }); setError(''); };
  const showModal = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModal({ isOpen: true, title, message, type });
    if (type === 'success') { setSuccessMessage(message); setTimeout(() => setSuccessMessage(''), 3000); }
    else if (type === 'error') setError(message);
  };

  const [entryModal, setEntryModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    periodId: number | null;
    weekStart: string;
    weekEnd: string;
    initialData: EntryFormData | null;
    editingEntryId: number | null;
  }>({
    isOpen: false, mode: 'create', periodId: null, weekStart: '', weekEnd: '', initialData: null, editingEntryId: null
  });

  const [viaticoModal, setViaticoModal] = useState<{
    isOpen: boolean;
    periodId: number | null;
    weekStart: string;
    weekEnd: string;
  }>({ isOpen: false, periodId: null, weekStart: '', weekEnd: '' });

  const [infonavitModal, setInfonavitModal] = useState<{ isOpen: boolean }>({ isOpen: false });

  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean; entryId: number | null; periodId: number | null; label: string; isDeleting: boolean;
  }>({ isOpen: false, entryId: null, periodId: null, label: '', isDeleting: false });

  // Upload hook
  const { startUpload } = useUploadThing('payrollFiles', {
    onClientUploadComplete: (files) => {
      console.log("Archivos de nómina subidos:", files);
    },
    onUploadError: (error) => {
      showModal('Error al subir archivos', error.message, 'error');
    }
  });

  // NUEVO: Cargar métodos de pago
  const fetchPaymentMethods = useCallback(async () => {
    try {
      setLoadingPaymentMethods(true);
      const res = await fetch('/api/project-manager/projects/payment-methods');
      if (res.ok) {
        const data: PaymentMethod[] = await res.json();
        setPaymentMethods(data);
      }
    } catch (e) {
      console.error('Error cargando métodos de pago:', e);
    } finally {
      setLoadingPaymentMethods(false);
    }
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const res = await fetch('/api/project-manager/auth/sessions');
      if (!res.ok) { router.push('/'); return; }
      const data = await res.json();
      setUserData(data);
      if (!projectId) {
        showModal('Error', 'No se especificó un proyecto en la URL', 'error');
        router.push('/project-manager-dashboard/projects');
      }
    } catch { router.push('/'); } finally { setLoading(false); }
  }, [router, projectId]);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch(`/api/project-manager/projects/personnel?projectId=${projectId}`);
      if (res.ok) setWorkers(await res.json());
    } catch (e) { console.error('Error cargando trabajadores:', e); }
  }, [projectId]);

  const fetchInfonavit = useCallback(async () => {
    try {
      const res = await fetch(`/api/project-manager/projects/payroll/infonavit?projectId=${projectId}`);
      if (res.ok) setInfonavitList(await res.json());
    } catch (e) { console.error('Error cargando infonavit:', e); }
  }, [projectId]);

  const fetchLoanCounts = useCallback(async (periodsList: PayrollPeriod[]) => {
    if (periodsList.length === 0) return;
    try {
      const results = await Promise.all(
        periodsList.map(async p => {
          const res = await fetch(`/api/project-manager/projects/payroll/loan-payments?periodId=${p.PayrollPeriodID}`);
          if (!res.ok) return { id: p.PayrollPeriodID, count: 0 };
          const data: LoanPaymentRow[] = await res.json();
          const pendientes = data.filter(d => d.Status !== 1).length;
          return { id: p.PayrollPeriodID, count: pendientes };
        })
      );
      const map: Record<number, number> = {};
      results.forEach(r => { map[r.id] = r.count; });
      setLoanCountByPeriod(map);
    } catch (e) { console.error('Error al contar cuotas:', e); }
  }, []);

  const fetchPeriods = useCallback(async () => {
    if (!projectId) return;
    try {
      setIsFetching(true);
      const res = await fetch(`/api/project-manager/projects/payroll?projectId=${projectId}`);
      let list: PayrollPeriod[] = [];
      if (res.ok) {
        list = await res.json();
        setPeriods(list);
      } else {
        showModal('Error', 'Error al obtener semanas', 'error');
      }

      const metaRes = await fetch(`/api/project-manager/projects/payroll/periods?projectId=${projectId}`);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        setSuggestedNext(meta.suggestedNext || null);
      }

      if (list.length > 0) {
        await fetchLoanCounts(list);
      }
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error al obtener semanas', 'error');
    } finally { setIsFetching(false); }
  }, [projectId, fetchLoanCounts]);

  const fetchEntries = useCallback(async (periodId: number) => {
    try {
      const res = await fetch(`/api/project-manager/projects/payroll/entries?periodId=${periodId}`);
      if (res.ok) {
        const data: PayrollEntry[] = await res.json();
        setEntriesByPeriod(prev => ({ ...prev, [periodId]: data }));
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchViaticos = useCallback(async (periodId: number) => {
    try {
      const res = await fetch(`/api/project-manager/projects/payroll/viaticos?periodId=${periodId}`);
      if (res.ok) {
        const data: ViaticoRow[] = await res.json();
        setViaticosByPeriod(prev => ({ ...prev, [periodId]: data }));
      }
    } catch (e) { console.error(e); }
  }, []);


  useEffect(() => {
    if (user && projectId) {
      fetchUserData();
      fetchWorkers();
      fetchInfonavit();
      fetchPeriods();
      fetchPaymentMethods();
    }
  }, [user, projectId, fetchUserData, fetchWorkers, fetchInfonavit, fetchPeriods, fetchPaymentMethods]);

  const handleCreateNextWeek = async () => {
    if (!projectId) return;
    try {
      const res = await fetch('/api/project-manager/projects/payroll/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      let data: any = null;
      try { data = await res.json(); } catch { data = null; }
      if (res.ok) {
        await fetchPeriods();
        showModal('Éxito', `SEMANA ${data?.weekNumber ?? ''} CREADA (${data?.startDate} a ${data?.endDate})`, 'success');
      } else {
        showModal('Error', data?.message || `Error ${res.status}`, 'error');
      }
    } catch (e) { console.error(e); showModal('Error', 'Error de conexión', 'error'); }
  };

  // ---------- CERRAR SEMANA ----------

  const openCloseWeek = (period: PayrollPeriod) => {
    const existentes = parseArchivos(period.Archivos);
    setCloseWeekModal({
      isOpen: true,
      period,
      total: '',
      methodId: period.MethodID ? String(period.MethodID) : '',
      isClosing: false,
      archivos: [],
      archivosExistentes: existentes,
      filesToDelete: [],
      isUploading: false,
      formError: ''
    });
    if (closeWeekFileInputRef.current) {
      closeWeekFileInputRef.current.value = '';
    }
  };

  const handleCloseWeekFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);

      const totalFiles = closeWeekModal.archivosExistentes.length + closeWeekModal.archivos.length + filesArray.length;
      if (totalFiles > 3) {
        showModal('Error en archivos', 'No puedes tener más de 3 archivos en total (incluyendo los existentes).', 'error');
        if (closeWeekFileInputRef.current) closeWeekFileInputRef.current.value = '';
        return;
      }

      const validation = validateFiles(filesArray);
      if (!validation.valid) {
        showModal('Error en archivos', validation.message, 'error');
        if (closeWeekFileInputRef.current) closeWeekFileInputRef.current.value = '';
        return;
      }

      setCloseWeekModal(prev => ({
        ...prev,
        archivos: [...prev.archivos, ...filesArray],
        formError: ''
      }));
      if (closeWeekFileInputRef.current) closeWeekFileInputRef.current.value = '';
    }
  };

  const removeCloseWeekFile = (index: number) => {
    setCloseWeekModal(prev => {
      const newFiles = [...prev.archivos];
      newFiles.splice(index, 1);
      return { ...prev, archivos: newFiles };
    });
  };

  const removeExistingCloseWeekFile = (index: number) => {
    setCloseWeekModal(prev => {
      const fileToRemove = prev.archivosExistentes[index];
      const newFilesToDelete = fileToRemove.key
        ? [...prev.filesToDelete, fileToRemove.key]
        : prev.filesToDelete;

      const newExistentes = [...prev.archivosExistentes];
      newExistentes.splice(index, 1);

      return {
        ...prev,
        archivosExistentes: newExistentes,
        filesToDelete: newFilesToDelete
      };
    });
  };

  // Helper: borra archivos de UploadThing por sus keys (para limpiar huérfanos)
  const deleteUploadThingFiles = async (keys: string[]) => {
    const validKeys = keys.filter(k => typeof k === 'string' && k.length > 0);
    if (validKeys.length === 0) return;
    try {
      await fetch('/api/uploadthing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKeys: validKeys })
      });
    } catch (e) {
      console.error('Error al eliminar archivos huérfanos de UploadThing:', e);
    }
  };

  const handleCloseWeek = async () => {
    if (!closeWeekModal.period) return;

    // ---------- 1) VALIDACIONES LOCALES ANTES DE SUBIR NADA ----------
    const totalNum = Number(closeWeekModal.total);
    if (closeWeekModal.total === '' || isNaN(totalNum) || totalNum < 0) {
      setCloseWeekModal(prev => ({ ...prev, formError: 'Ingresa un Total de nómina válido (mayor o igual a 0).' }));
      return;
    }
    if (!closeWeekModal.methodId) {
      setCloseWeekModal(prev => ({ ...prev, formError: 'Selecciona un método de pago.' }));
      return;
    }
    if (loadingPaymentMethods) {
      setCloseWeekModal(prev => ({ ...prev, formError: 'Espera a que se carguen los métodos de pago.' }));
      return;
    }
    const methodExists = paymentMethods.some(m => String(m.methodId) === String(closeWeekModal.methodId));
    if (!methodExists) {
      setCloseWeekModal(prev => ({ ...prev, formError: 'El método de pago seleccionado no es válido.' }));
      return;
    }
    if (closeWeekModal.archivos.length > 0) {
      const validation = validateFiles(closeWeekModal.archivos);
      if (!validation.valid) {
        setCloseWeekModal(prev => ({ ...prev, formError: validation.message }));
        return;
      }
    }

    setCloseWeekModal(prev => ({ ...prev, isClosing: true, formError: '' }));
    const period = closeWeekModal.period;
    setClosingId(period.PayrollPeriodID);

    let newlyUploadedKeys: string[] = [];

    try {
      // ---------- 2) SUBIR ARCHIVOS NUEVOS (si hay) ----------
      let archivosSubidos: ArchivoAdjunto[] = [];
      if (closeWeekModal.archivos.length > 0) {
        try {
          const uploadedFiles = await startUpload(closeWeekModal.archivos);
          if (uploadedFiles && uploadedFiles.length > 0) {
            archivosSubidos = uploadedFiles.map(file => ({
              nombre: file.name,
              url: file.ufsUrl || file.url,
              tipo: file.type,
              key: file.key
            }));
            newlyUploadedKeys = uploadedFiles
              .map(f => f.key)
              .filter((k): k is string => typeof k === 'string' && k.length > 0);
          }
        } catch (uploadError) {
          console.error('Error al subir archivos:', uploadError);
          setCloseWeekModal(prev => ({
            ...prev,
            isClosing: false,
            formError: 'No se pudieron subir los archivos adjuntos. Intenta de nuevo.'
          }));
          setClosingId(null);
          return;
        }
      }

      const todosArchivos: ArchivoAdjunto[] = [
        ...closeWeekModal.archivosExistentes,
        ...archivosSubidos
      ];

      // ---------- 3) PUT PARA CERRAR LA SEMANA ----------
      const res = await fetch(`/api/project-manager/projects/payroll/periods?id=${period.PayrollPeriodID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 2,
          total: totalNum,
          methodId: Number(closeWeekModal.methodId),
          archivos: todosArchivos,
          filesToDelete: closeWeekModal.filesToDelete
        })
      });

      let data: any = null;
      try { data = await res.json(); } catch { data = null; }

      if (!res.ok) {
        // ---------- 3a) FALLÓ EL PUT → ROLLBACK DE ARCHIVOS NUEVOS ----------
        if (newlyUploadedKeys.length > 0) {
          await deleteUploadThingFiles(newlyUploadedKeys);
        }
        const backendMessage =
          data?.message ||
          data?.error ||
          (res.status === 400
            ? 'Datos inválidos. Revisa el total, el método de pago y los archivos.'
            : `Error ${res.status} al cerrar la semana.`);
        setCloseWeekModal(prev => ({ ...prev, isClosing: false, formError: backendMessage }));
        return;
      }

      // ---------- 4) ÉXITO ----------
      await fetchPeriods();
      setCloseWeekModal({
        isOpen: false, period: null, total: '', methodId: '', isClosing: false,
        archivos: [], archivosExistentes: [], filesToDelete: [], isUploading: false, formError: ''
      });
      if (closeWeekFileInputRef.current) {
        closeWeekFileInputRef.current.value = '';
      }
      showModal('Éxito', 'SEMANA CERRADA', 'success');
    } catch (e) {
      console.error(e);
      if (newlyUploadedKeys.length > 0) {
        await deleteUploadThingFiles(newlyUploadedKeys);
      }
      setCloseWeekModal(prev => ({
        ...prev,
        isClosing: false,
        formError: 'Error de conexión al cerrar la semana. Intenta de nuevo.'
      }));
    } finally {
      setClosingId(null);
    }
  };

  // ---------- REABRIR SEMANA ----------

  const openReopenWeek = (period: PayrollPeriod) => {
    setReopenWeekModal({ isOpen: true, period, isReopening: false });
  };

  const handleReopenWeek = async () => {
    if (!reopenWeekModal.period) return;
    const period = reopenWeekModal.period;

    setReopenWeekModal(prev => ({ ...prev, isReopening: true }));
    setClosingId(period.PayrollPeriodID);

    try {
      const res = await fetch(`/api/project-manager/projects/payroll/periods?id=${period.PayrollPeriodID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 0 })
      });

      let data: any = null;
      try { data = await res.json(); } catch { data = null; }

      if (res.ok) {
        await fetchPeriods();
        setReopenWeekModal({ isOpen: false, period: null, isReopening: false });
        showModal('Éxito', 'SEMANA REABIERTA. TOTAL Y ARCHIVOS ELIMINADOS.', 'success');
      } else {
        showModal('Error', data?.message || 'No se pudo reabrir', 'error');
        setReopenWeekModal(prev => ({ ...prev, isReopening: false }));
      }
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error de conexión', 'error');
      setReopenWeekModal(prev => ({ ...prev, isReopening: false }));
    } finally {
      setClosingId(null);
    }
  };

  // ---------- ELIMINAR SEMANA ----------

  const openDeleteWeek = (period: PayrollPeriod) => {
    if (period.Status === 2) {
      showModal('Error', 'Reabre la semana antes de eliminarla', 'error');
      return;
    }
    setDeleteWeekModal({ isOpen: true, period, isDeleting: false });
  };

  const handleDeleteWeek = async () => {
    if (!deleteWeekModal.period) return;
    setDeleteWeekModal(prev => ({ ...prev, isDeleting: true }));
    try {
      const res = await fetch(
        `/api/project-manager/projects/payroll/periods?id=${deleteWeekModal.period.PayrollPeriodID}`,
        { method: 'DELETE' }
      );
      let data: any = null;
      try { data = await res.json(); } catch { data = null; }
      if (res.ok) {
        await fetchPeriods();
        setDeleteWeekModal({ isOpen: false, period: null, isDeleting: false });
        showModal('Éxito', data?.message || 'SEMANA ELIMINADA', 'success');
      } else {
        showModal('Error', data?.message || 'No se pudo eliminar la semana', 'error');
        setDeleteWeekModal(prev => ({ ...prev, isDeleting: false }));
      }
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error de conexión', 'error');
      setDeleteWeekModal(prev => ({ ...prev, isDeleting: false }));
    }
  };

  const togglePeriod = async (periodId: number) => {
    const next = new Set(expandedPeriods);
    if (next.has(periodId)) next.delete(periodId);
    else {
      next.add(periodId);
      if (!entriesByPeriod[periodId]) await fetchEntries(periodId);
      if (!viaticosByPeriod[periodId]) await fetchViaticos(periodId);
    }
    setExpandedPeriods(next);
  };

  const openCreateEntry = async (period: PayrollPeriod) => {
    if (period.Status === 2) { showModal('Error', 'La semana está cerrada. Reábrela para editar.', 'error'); return; }
    if (period.PayrollStatus === 1) { showModal('Error', 'La nómina está VALIDADA. No se puede editar.', 'error'); return; }
    await fetchWorkers();
    setEntryModal({
      isOpen: true, mode: 'create', periodId: period.PayrollPeriodID,
      weekStart: formatDateInput(period.StartDate), weekEnd: formatDateInput(period.EndDate),
      initialData: null, editingEntryId: null
    });
  };

  const openEditEntry = (entry: PayrollEntry, period: PayrollPeriod) => {
    if (period.Status === 2) { showModal('Error', 'La semana está cerrada. Reábrela para editar.', 'error'); return; }
    if (period.PayrollStatus === 1) { showModal('Error', 'La nómina está VALIDADA. No se puede editar.', 'error'); return; }
    setEntryModal({
      isOpen: true, mode: 'edit', periodId: period.PayrollPeriodID,
      weekStart: formatDateInput(period.StartDate), weekEnd: formatDateInput(period.EndDate),
      initialData: {
        Source: entry.Source,
        ProjectPersonnelID: entry.Source === 'PROJECT' ? String(entry.ProjectPersonnelID) : '',
        AssignmentID: entry.Source === 'BASE' ? String(entry.AssignmentID) : '',
        WorkDate: formatDateInput(entry.WorkDate),
        Shift: entry.Shift || 'DIA',
        RegularHours: String(entry.RegularHours),
        ExtraHours: String(entry.ExtraHours)
      },
      editingEntryId: entry.EntryID
    });
  };

  const handleSaveEntry = async (data: EntryFormData) => {
    if (!entryModal.periodId) return;
    const period = periods.find(p => p.PayrollPeriodID === entryModal.periodId);
    if (period?.Status === 2) { showModal('Error', 'La semana está cerrada. Reábrela para editar.', 'error'); return; }
    if (period?.PayrollStatus === 1) { showModal('Error', 'La nómina está VALIDADA. No se puede editar.', 'error'); return; }
    setIsSaving(true);
    try {
      const payload = {
        periodId: entryModal.periodId,
        source: data.Source,
        projectPersonnelId: data.Source === 'PROJECT' ? Number(data.ProjectPersonnelID) : null,
        assignmentId: data.Source === 'BASE' ? Number(data.AssignmentID) : null,
        workDate: data.WorkDate,
        shift: data.Shift,
        regularHours: Number(data.RegularHours),
        extraHours: Number(data.ExtraHours)
      };
      const url = entryModal.mode === 'create'
        ? '/api/project-manager/projects/payroll/entries'
        : `/api/project-manager/projects/payroll/entries?id=${entryModal.editingEntryId}`;
      const res = await fetch(url, {
        method: entryModal.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      let resp: any = null;
      try { resp = await res.json(); } catch { resp = null; }
      if (res.ok) {
        await fetchEntries(entryModal.periodId);
        await fetchPeriods();
        setEntryModal(prev => ({ ...prev, isOpen: false }));
        showModal('Éxito', 'REGISTRO GUARDADO CORRECTAMENTE', 'success');
      } else showModal('Error', resp?.message || `Error ${res.status}`, 'error');
    } catch (e) { console.error(e); showModal('Error', 'Error de conexión', 'error'); }
    finally { setIsSaving(false); }
  };

  const openViaticoModal = async (period: PayrollPeriod) => {
    if (period.Status === 2) { showModal('Error', 'La semana está cerrada. Reábrela para editar.', 'error'); return; }
    if (period.PayrollStatus === 1) { showModal('Error', 'La nómina está VALIDADA. No se puede editar.', 'error'); return; }
    await fetchWorkers();
    if (!viaticosByPeriod[period.PayrollPeriodID]) await fetchViaticos(period.PayrollPeriodID);
    setViaticoModal({
      isOpen: true, periodId: period.PayrollPeriodID,
      weekStart: formatDateInput(period.StartDate), weekEnd: formatDateInput(period.EndDate)
    });
  };

  const handleSaveViatico = async (data: ViaticoFormData) => {
    if (!viaticoModal.periodId) return;
    const period = periods.find(p => p.PayrollPeriodID === viaticoModal.periodId);
    if (period?.Status === 2) { showModal('Error', 'La semana está cerrada. Reábrela para editar.', 'error'); return; }
    if (period?.PayrollStatus === 1) { showModal('Error', 'La nómina está VALIDADA. No se puede editar.', 'error'); return; }
    setIsSavingViatico(true);
    try {
      const res = await fetch('/api/project-manager/projects/payroll/viaticos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: viaticoModal.periodId,
          source: data.Source,
          projectPersonnelId: data.Source === 'PROJECT' ? Number(data.ProjectPersonnelID) : null,
          assignmentId: data.Source === 'BASE' ? Number(data.AssignmentID) : null,
          diasViaticos: Number(data.DiasViaticos) || 0
        })
      });
      let resp: any = null;
      try { resp = await res.json(); } catch { resp = null; }
      if (res.ok) {
        await fetchViaticos(viaticoModal.periodId);
        setViaticoModal(prev => ({ ...prev, isOpen: false }));
        showModal('Éxito', 'VIÁTICOS GUARDADOS CORRECTAMENTE', 'success');
      } else showModal('Error', resp?.message || `Error ${res.status}`, 'error');
    } catch (e) { console.error(e); showModal('Error', 'Error de conexión', 'error'); }
    finally { setIsSavingViatico(false); }
  };

  const openInfonavitModal = async () => {
    await fetchWorkers();
    await fetchInfonavit();
    setInfonavitModal({ isOpen: true });
  };

  const handleSaveInfonavit = async (data: InfonavitFormData) => {
    if (data.Source === 'BASE' && !data.AssignmentID) {
      showModal('Error', 'Selecciona un trabajador', 'error');
      return;
    }
    if (data.Source === 'PROJECT' && !data.ProjectPersonnelID) {
      showModal('Error', 'Selecciona un trabajador', 'error');
      return;
    }

    setIsSavingInfonavit(true);
    try {
      const res = await fetch('/api/project-manager/projects/payroll/infonavit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: data.Source,
          projectPersonnelId: data.Source === 'PROJECT' ? Number(data.ProjectPersonnelID) : null,
          assignmentId: data.Source === 'BASE' ? Number(data.AssignmentID) : null,
          dailyAmount: Number(data.DailyAmount) || 0
        })
      });
      let resp: any = null;
      try { resp = await res.json(); } catch { resp = null; }
      if (res.ok) {
        await fetchInfonavit();
        setInfonavitModal({ isOpen: false });
        showModal('Éxito', 'INFONAVIT GUARDADO CORRECTAMENTE', 'success');
      } else {
        showModal('Error', resp?.message || `Error ${res.status}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error de conexión', 'error');
    } finally {
      setIsSavingInfonavit(false);
    }
  };

  const openDeleteEntry = (entry: PayrollEntry, period: PayrollPeriod) => {
    if (period.Status === 2) { showModal('Error', 'La semana está cerrada. Reábrela para editar.', 'error'); return; }
    if (period.PayrollStatus === 1) { showModal('Error', 'La nómina está VALIDADA. No se puede editar.', 'error'); return; }
    const worker = findWorkerForEntry(workers, entry);
    setDeleteModal({
      isOpen: true, entryId: entry.EntryID, periodId: period.PayrollPeriodID,
      label: `${worker?.FullName || entry.WorkerName || 'Trabajador'} — ${formatDate(entry.WorkDate)} (${entry.Shift})`,
      isDeleting: false
    });
  };

  const handleDeleteEntry = async () => {
    if (!deleteModal.entryId) return;
    setDeleteModal(prev => ({ ...prev, isDeleting: true }));
    try {
      const res = await fetch(`/api/project-manager/projects/payroll/entries?id=${deleteModal.entryId}`, { method: 'DELETE' });
      let resp: any = null;
      try { resp = await res.json(); } catch { resp = null; }
      if (res.ok) {
        if (deleteModal.periodId) {
          await fetchEntries(deleteModal.periodId);
        }
        await fetchPeriods();
        showModal('Éxito', 'ENTRADA ELIMINADA', 'success');
      } else showModal('Error', resp?.message || 'No se pudo eliminar', 'error');
    } catch (e) { console.error(e); showModal('Error', 'Error de conexión', 'error'); }
    finally { setDeleteModal({ isOpen: false, entryId: null, periodId: null, label: '', isDeleting: false }); }
  };

  // ----------- PRÉSTAMOS -----------

  const fetchLoanPayments = async (periodId: number) => {
    setIsLoadingLoanPayments(true);
    setSelectedLoanPayments(new Set());
    try {
      const res = await fetch(`/api/project-manager/projects/payroll/loan-payments?periodId=${periodId}`);
      if (res.ok) {
        const data: LoanPaymentRow[] = await res.json();
        setLoanPayments(data);
        setSelectedLoanPayments(new Set(
          data.filter(d => d.Status !== 1).map(d => d.PaymentID)
        ));
      } else {
        setLoanPayments([]);
      }
    } catch (e) {
      console.error(e);
      setLoanPayments([]);
    } finally {
      setIsLoadingLoanPayments(false);
    }
  };

  const openLoanModal = async (period: PayrollPeriod) => {
    if (period.Status === 2) {
      showModal('Error', 'La semana está cerrada. Reábrela para aplicar descuentos.', 'error');
      return;
    }
    if (period.PayrollStatus === 1) {
      showModal('Error', 'La nómina está VALIDADA. No se puede modificar.', 'error');
      return;
    }
    setLoanModal({
      isOpen: true,
      periodId: period.PayrollPeriodID,
      weekLabel: `${formatDate(period.StartDate)} - ${formatDate(period.EndDate)}`
    });
    await fetchLoanPayments(period.PayrollPeriodID);
  };

  const closeLoanModal = () => {
    setLoanModal({ isOpen: false, periodId: null, weekLabel: '' });
    setLoanPayments([]);
    setSelectedLoanPayments(new Set());
  };

  const toggleLoanPayment = (id: number) => {
    setSelectedLoanPayments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllLoanPayments = (select: boolean) => {
    if (select) {
      setSelectedLoanPayments(new Set(
        loanPayments.filter(p => p.Status !== 1).map(p => p.PaymentID)
      ));
    } else {
      setSelectedLoanPayments(new Set());
    }
  };

  const handleApplyLoanDiscounts = async () => {
    if (!loanModal.periodId || selectedLoanPayments.size === 0) {
      showModal('Info', 'Selecciona al menos una cuota', 'info');
      return;
    }
    setIsApplyingDiscounts(true);
    try {
      const res = await fetch('/api/project-manager/projects/payroll/loan-payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: loanModal.periodId,
          paymentIds: Array.from(selectedLoanPayments)
        })
      });
      let resp: any = null;
      try { resp = await res.json(); } catch { resp = null; }
      if (res.ok) {
        await fetchLoanPayments(loanModal.periodId);
        await fetchLoanCounts(periods);
        showModal('Éxito', resp?.message || 'Descuentos aplicados', 'success');
      } else {
        showModal('Error', resp?.message || 'Error al aplicar descuentos', 'error');
      }
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error de conexión', 'error');
    } finally {
      setIsApplyingDiscounts(false);
    }
  };

  // ----------- DESCARGA ----------

  const handleDownloadWeek = (period: PayrollPeriod) =>
    window.location.href = `/api/download/edit/NOMINA?projectId=${projectId}&periodId=${period.PayrollPeriodID}`;
  const handleDownloadAll = () =>
    window.location.href = `/api/download/edit/NOMINA?projectId=${projectId}`;

  const filteredPeriods = periods.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return `semana ${p.WeekNumber}`.includes(term) || p.StartDate.includes(term) || p.EndDate.includes(term);
  });

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3a6ea5] mx-auto"></div>
          <p className="mt-4 text-gray-700 font-medium">VERIFICANDO SESIÓN...</p>
        </div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader title="PANEL DE ADMINISTRACIÓN DE PROYECTOS" />

      {/* MODAL GLOBAL (errores/success) con z-index altísimo para estar SIEMPRE al frente */}
      <Modal isOpen={modal.isOpen} onClose={closeModal} title={modal.title} message={modal.message} type={modal.type} />

      <EntryModal
        isOpen={entryModal.isOpen}
        onClose={() => setEntryModal(prev => ({ ...prev, isOpen: false }))}
        onSave={handleSaveEntry}
        workers={workers}
        initialData={entryModal.initialData}
        isSaving={isSaving}
        weekStart={entryModal.weekStart}
        weekEnd={entryModal.weekEnd}
        mode={entryModal.mode}
      />

      <ViaticoModal
        isOpen={viaticoModal.isOpen}
        onClose={() => setViaticoModal(prev => ({ ...prev, isOpen: false }))}
        onSave={handleSaveViatico}
        workers={workers}
        isSaving={isSavingViatico}
        weekStart={viaticoModal.weekStart}
        weekEnd={viaticoModal.weekEnd}
        viaticosActuales={viaticoModal.periodId ? (viaticosByPeriod[viaticoModal.periodId] || []) : []}
      />

      <InfonavitModal
        isOpen={infonavitModal.isOpen}
        onClose={() => setInfonavitModal({ isOpen: false })}
        onSave={handleSaveInfonavit}
        workers={workers}
        isSaving={isSavingInfonavit}
        infonavitActuales={infonavitList}
      />

      <LoanDiscountModal
        isOpen={loanModal.isOpen}
        onClose={closeLoanModal}
        weekLabel={loanModal.weekLabel}
        payments={loanPayments}
        selected={selectedLoanPayments}
        onToggle={toggleLoanPayment}
        onSelectAll={selectAllLoanPayments}
        onApply={handleApplyLoanDiscounts}
        isLoading={isLoadingLoanPayments}
        isApplying={isApplyingDiscounts}
      />

      <DayEntriesModal
        isOpen={dayModal.isOpen}
        onClose={() => setDayModal(prev => ({ ...prev, isOpen: false }))}
        workerName={dayModal.workerName}
        entries={dayModal.entries}
        isClosed={dayModal.isClosed}
        onEdit={(entry) => {
          const period = periods.find(p => p.PayrollPeriodID === entry.PayrollPeriodID);
          if(period) openEditEntry(entry, period);
        }}
        onDelete={(entry) => {
          const period = periods.find(p => p.PayrollPeriodID === entry.PayrollPeriodID);
          if(period) openDeleteEntry(entry, period);
        }}
      />

      {/* MODAL CERRAR SEMANA */}
      {closeWeekModal.isOpen && closeWeekModal.period && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full animate-fade-in relative z-[10000] max-h-[90vh] overflow-y-auto">
            <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                  CERRAR SEMANA
                </h2>
                <p className="text-sm text-gray-600 mt-2 leading-5">
                  Semana: {formatDate(closeWeekModal.period.StartDate)} - {formatDate(closeWeekModal.period.EndDate)}
                </p>
              </div>
              <button onClick={() => {
                setCloseWeekModal({ isOpen: false, period: null, total: '', methodId: '', isClosing: false, archivos: [], archivosExistentes: [], filesToDelete: [], isUploading: false, formError: '' });
                if (closeWeekFileInputRef.current) closeWeekFileInputRef.current.value = '';
              }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              {closeWeekModal.formError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 animate-fade-in">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-red-600 mr-2 flex-shrink-0" />
                    <p className="text-xs font-medium text-red-700 leading-5">{closeWeekModal.formError}</p>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
                    DATOS DE CIERRE
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                        TOTAL DE NÓMINA DE LA SEMANA ($) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={closeWeekModal.total}
                        onChange={(e) => setCloseWeekModal(prev => ({ ...prev, total: e.target.value, formError: '' }))}
                        className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                        MÉTODO DE PAGO *
                      </label>
                      {loadingPaymentMethods ? (
                        <div className="flex items-center space-x-2 py-2.5 px-3 border border-gray-400 rounded bg-gray-50">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#3a6ea5]"></div>
                          <span className="text-sm text-gray-500">Cargando métodos...</span>
                        </div>
                      ) : (
                        <select
                          value={closeWeekModal.methodId}
                          onChange={(e) => setCloseWeekModal(prev => ({ ...prev, methodId: e.target.value, formError: '' }))}
                          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                          required
                        >
                          <option value="">SELECCIONA UN MÉTODO DE PAGO</option>
                          {paymentMethods.map(m => (
                            <option key={m.methodId} value={String(m.methodId)}>
                              {m.methodName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
                    ADJUNTAR ARCHIVOS (OPCIONAL)
                  </h3>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
                      multiple
                      onChange={handleCloseWeekFileChange}
                      ref={closeWeekFileInputRef}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => closeWeekFileInputRef.current?.click()}
                      disabled={closeWeekModal.isClosing}
                      className="w-full px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#3a6ea5] transition-colors flex items-center justify-center text-gray-500 hover:text-[#3a6ea5] text-sm disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      SELECCIONAR ARCHIVOS
                    </button>
                  </div>

                  {closeWeekModal.archivos.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {closeWeekModal.archivos.map((file, index) => (
                        <div key={`new-${index}`} className="flex items-center justify-between p-3 bg-white rounded border border-gray-200">
                          <div className="flex items-center truncate">
                            <FileIcon type={file.type} size={5} />
                            <span className="ml-3 text-sm truncate font-medium text-gray-700">{file.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCloseWeekFile(index)}
                            disabled={closeWeekModal.isClosing}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {closeWeekModal.archivosExistentes.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-bold text-gray-600 uppercase mt-3">ARCHIVOS YA ADJUNTOS:</p>
                      {closeWeekModal.archivosExistentes.map((archivo, index) => (
                        <div key={`existing-${index}`} className="flex items-center justify-between p-3 bg-white rounded border border-gray-200">
                          <div className="flex items-center">
                            <FileIcon type={archivo.tipo} size={5} />
                            <a
                              href={archivo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-3 text-sm text-[#3a6ea5] hover:underline truncate max-w-[200px] font-medium"
                            >
                              {archivo.nombre}
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExistingCloseWeekFile(index)}
                            disabled={closeWeekModal.isClosing}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-300 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setCloseWeekModal({ isOpen: false, period: null, total: '', methodId: '', isClosing: false, archivos: [], archivosExistentes: [], filesToDelete: [], isUploading: false, formError: '' });
                    if (closeWeekFileInputRef.current) closeWeekFileInputRef.current.value = '';
                  }}
                  disabled={closeWeekModal.isClosing}
                  className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleCloseWeek}
                  disabled={closeWeekModal.isClosing}
                  className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center whitespace-nowrap min-w-[140px] disabled:opacity-50"
                >
                  {closeWeekModal.isClosing ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>CERRANDO...</>
                  ) : 'CERRAR SEMANA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REABRIR SEMANA */}
      {reopenWeekModal.isOpen && reopenWeekModal.period && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
            <div className="p-6 pb-4 border-b border-gray-300">
              <h2 className="text-lg font-bold text-gray-900 flex items-center tracking-tight">
                REABRIR SEMANA
              </h2>
              <p className="text-sm text-gray-600 mt-2 leading-5">
                ¿Reabrir la <span className="font-bold">SEMANA {reopenWeekModal.period.WeekNumber}</span>{' '}
                ({formatDate(reopenWeekModal.period.StartDate)} - {formatDate(reopenWeekModal.period.EndDate)})?
              </p>
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-800 leading-5">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  Al reabrir la semana se eliminarán el <strong>Total</strong> y los <strong>archivos adjuntos</strong> de la nómina.
                  Deberás volver a capturarlos cuando la cierres de nuevo.
                </p>
              </div>
            </div>
            <div className="p-6 pt-4 flex justify-end gap-3">
              <button
                onClick={() => setReopenWeekModal({ isOpen: false, period: null, isReopening: false })}
                disabled={reopenWeekModal.isReopening}
                className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                onClick={handleReopenWeek}
                disabled={reopenWeekModal.isReopening}
                className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center min-w-[140px] disabled:opacity-50"
              >
                {reopenWeekModal.isReopening ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    REABRIENDO...
                  </>
                ) : (
                  'REABRIR'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR SEMANA */}
      {deleteWeekModal.isOpen && deleteWeekModal.period && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
            <div className="p-6 pb-4 border-b border-gray-300">
              <h2 className="text-lg font-bold text-gray-900 flex items-center tracking-tight">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                CONFIRMAR ELIMINACIÓN
              </h2>
              <p className="text-sm text-gray-600 mt-2 leading-5">
                ¿Eliminar la <span className="font-bold">SEMANA {deleteWeekModal.period.WeekNumber}</span>{' '}
                ({formatDate(deleteWeekModal.period.StartDate)} - {formatDate(deleteWeekModal.period.EndDate)})?
              </p>
              <p className="text-sm text-gray-500 mt-2 leading-5">
                Se eliminarán también todas las entradas de nómina, viáticos y registros asociados.
                Las cuotas de préstamos aplicadas volverán a estado pendiente.
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="p-6 pt-4 flex justify-end gap-3">
              <button
                onClick={() => setDeleteWeekModal({ isOpen: false, period: null, isDeleting: false })}
                disabled={deleteWeekModal.isDeleting}
                className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                onClick={handleDeleteWeek}
                disabled={deleteWeekModal.isDeleting}
                className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center min-w-[120px] disabled:opacity-50"
              >
                {deleteWeekModal.isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ELIMINANDO...
                  </>
                ) : (
                  'ELIMINAR'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
            <div className="p-6 pb-4 border-b border-gray-300">
              <h2 className="text-lg font-bold text-gray-900 flex items-center tracking-tight">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />CONFIRMAR ELIMINACIÓN
              </h2>
              <p className="text-sm text-gray-600 mt-2 leading-5">¿Eliminar la entrada de <span className="font-bold">{deleteModal.label}</span>?</p>
              <p className="text-sm text-gray-500 mt-2 leading-5">Esta acción no se puede deshacer.</p>
            </div>
            <div className="p-6 pt-4 flex justify-end gap-3">
              <button onClick={() => setDeleteModal({ isOpen: false, entryId: null, periodId: null, label: '', isDeleting: false })} disabled={deleteModal.isDeleting} className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50">CANCELAR</button>
              <button onClick={handleDeleteEntry} disabled={deleteModal.isDeleting} className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center min-w-[100px] disabled:opacity-50">
                {deleteModal.isDeleting ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>ELIMINANDO...</>) : 'ELIMINAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="pt-[72px] pb-[80px] min-h-screen bg-gray-100">
        <div className="w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto">
          <div className="mb-6">
            <div className="bg-[#3a6ea5] p-4 rounded-lg shadow border border-[#3a6ea5]">
              <h1 className="text-xl font-bold text-white tracking-tight">NÓMINAS</h1>
              <p className="text-sm text-gray-200 mt-1">Administre y visualice todos los registros de nómina del proyecto.</p>
              {projectId && (
                <p className="text-xs text-gray-300 mt-1">
                  Proyecto ID: {projectId}
                </p>
              )}
            </div>
          </div>

          {successMessage && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 animate-fade-in">
              <div className="flex items-center"><CheckCircle className="h-5 w-5 text-green-600 mr-2" /><p className="text-sm font-medium text-gray-600 leading-5">{successMessage}</p></div>
            </div>
          )}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 animate-fade-in">
              <div className="flex items-center"><AlertCircle className="h-5 w-5 text-red-600 mr-2" /><p className="text-sm font-medium text-gray-600 leading-5">{error}</p></div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="flex-1 relative">
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text" placeholder="Buscar semana por número o fecha..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
              />
            </div>
            <button onClick={() => { setSearchTerm(''); fetchPeriods(); }} className="px-4 py-2.5 bg-gray-200 text-black font-bold rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center whitespace-nowrap">
              <RefreshCw className="h-4 w-4 mr-2" />ACTUALIZAR
            </button>
            <button onClick={openInfonavitModal}
            className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center whitespace-nowrap"
            >
              INFONAVIT
            </button>
            {suggestedNext && (
              <button onClick={handleCreateNextWeek}
              className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center whitespace-nowrap"
              >
                CREAR SIGUIENTE SEMANA
              </button>
            )}
          </div>

          {isFetching ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3a6ea5] mb-2"></div>
                <p className="text-gray-600">Cargando semanas...</p>
              </div>
            </div>
          ) : filteredPeriods.length === 0 ? (
            <div className="bg-white rounded-lg shadow border border-gray-300 py-12 text-center">
              <CalendarDays className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-bold text-gray-900">NO HAY SEMANAS REGISTRADAS</h3>
              <p className="mt-1 text-sm text-gray-500">Cree la siguiente semana para empezar a capturar horas.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPeriods.map(period => {
                const isExpanded = expandedPeriods.has(period.PayrollPeriodID);
                const entries = entriesByPeriod[period.PayrollPeriodID] || [];
                const isClosed = period.Status === 2;
                const isValidated = period.PayrollStatus === 1;
                const pendingLoans = loanCountByPeriod[period.PayrollPeriodID] || 0;
                const archivosAdjuntos = parseArchivos(period.Archivos);
                const firstArchivoUrl = archivosAdjuntos.length > 0 ? archivosAdjuntos[0].url : null;

                const entriesByWorker: Record<string, PayrollEntry[]> = {};
                entries.forEach(entry => {
                  const worker = findWorkerForEntry(workers, entry);
                  const key = worker
                    ? workerKey(worker)
                    : `${entry.Source}-${entry.ProjectPersonnelID || entry.AssignmentID}`;
                  if (!entriesByWorker[key]) entriesByWorker[key] = [];
                  entriesByWorker[key].push(entry);
                });

                const groupedList = workers.map(w => ({
                  worker: w,
                  entries: entriesByWorker[workerKey(w)] || []
                }));

                return (
                  <div key={period.PayrollPeriodID} className="bg-white rounded-lg shadow border border-gray-300 overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => togglePeriod(period.PayrollPeriodID)}>
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-5 w-5 text-[#3a6ea5]" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                            SEMANA {period.WeekNumber}
                            {isValidated && (
                              <span className="px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full bg-green-100 text-green-800">
                                VALIDADO
                              </span>
                            )}
                            <span className="text-xs font-normal">
                              {firstArchivoUrl ? (
                                <a
                                  href={firstArchivoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-gray-700 hover:underline"
                                  title="Ver documento"
                                >
                                  Ver
                                </a>
                              ) : (
                                <span className="text-xs text-gray-400">Sin documentos</span>
                              )}
                            </span>
                          </h3>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            {formatDate(period.StartDate)} - {formatDate(period.EndDate)}
                          </p>
                          {period.Total !== null && period.Total !== undefined && (
                            <p className="text-xs font-bold text-[#3a6ea5] mt-1">
                              Total: {formatCurrencyNumber(period.Total)}
                              {period.MethodName && (
                                <span className="ml-2 text-gray-500 font-medium">
                                  ({period.MethodName})
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="hidden md:flex flex-col items-end">
                          <span className="text-xs text-gray-500 flex items-center gap-1"><Users className="h-3 w-3" />{period.TotalEntries} registros</span>
                        </div>

                        <button onClick={(e) => { e.stopPropagation(); handleDownloadWeek(period); }} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors" title="Descargar Excel de esta semana">
                          <Download className="h-4 w-4" />
                        </button>

                        {isClosed ? (
                          <button onClick={(e) => { e.stopPropagation(); openReopenWeek(period); }} disabled={closingId === period.PayrollPeriodID} className="px-3 py-1.5 text-xs font-bold bg-gray-300 text-gray-800 rounded hover:bg-gray-400 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap transition-colors">
                            <Unlock className="h-3.5 w-3.5" />REABRIR
                          </button>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); openCreateEntry(period); }} className="p-2 bg-[#3a6ea5] text-white rounded-lg hover:bg-[#2d5592] transition-colors" title="Agregar entrada diaria">
                              <Plus className="h-4 w-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); openViaticoModal(period); }} className="p-2 bg-[#3a6ea5] text-white rounded-lg hover:bg-[#2d5592] transition-colors" title="Capturar viáticos por empleado">
                              <BadgeDollarSign className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openLoanModal(period); }}
                              className="p-2 bg-[#3a6ea5] text-white rounded-lg hover:bg-[#2d5592] transition-colors relative"
                              title="Descontar préstamos de esta semana"
                            >
                              <Banknote className="h-4 w-4" />
                              {pendingLoans > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                                  {pendingLoans}
                                </span>
                              )}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); openCloseWeek(period); }} disabled={closingId === period.PayrollPeriodID} 
                            className="px-3 py-1.5 text-xs font-bold bg-gray-400 text-white rounded hover:bg-gray-500 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap transition-colors"
                            >
                              {closingId === period.PayrollPeriodID ? 'CERRANDO...' : 'CERRAR SEMANA'}
                            </button>
                          </>
                        )}

                        {!isValidated && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDeleteWeek(period); }}
                            disabled={isClosed || closingId === period.PayrollPeriodID}
                            className={`p-2 rounded-lg transition-colors ${
                              isClosed
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-red-600 text-white hover:bg-red-700'
                            }`}
                            title={isClosed ? 'Reabre la semana para poder eliminarla' : 'Eliminar semana'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-200">
                        {groupedList.length === 0 ? (
                          <div className="p-6 text-center text-sm text-gray-500">
                            {isClosed ? 'Esta semana está cerrada y no tiene entradas.' : 'No hay empleados asociados al proyecto.'}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100">
                                <tr>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">No.</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">NOMBRE</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">CATEGORÍA</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">SALARIO IMSS</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">L</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">M</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">M</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">J</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">V</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">S</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">D</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">T DT</th>
                                  <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">TTE</th>
                                  <th  className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300 text-center">ACCIONES</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupedList.map((group, idx) => {
                                  const worker = group.worker;
                                  const workerEntries = group.entries;
                                  const name = worker?.FullName || 'Desconocido';
                                  const position = worker?.Position || '—';
                                  const salaryIMSS = worker?.SalaryIMSS || 0;

                                  let totalDiasTrabajados = 0;
                                  let totalHorasExtra = 0;

                                  const weekData = {
                                    L: { norm: 0, extra: 0 },
                                    M: { norm: 0, extra: 0 },
                                    M2: { norm: 0, extra: 0 },
                                    J: { norm: 0, extra: 0 },
                                    V: { norm: 0, extra: 0 },
                                    S: { norm: 0, extra: 0 },
                                    D: { norm: 0, extra: 0 },
                                  };

                                  workerEntries.forEach(e => {
                                    const dayLetter = getDayLetter(e.WorkDate);

                                    if (Number(e.RegularHours) > 0) {
                                      totalDiasTrabajados += 1;
                                    }
                                    totalHorasExtra += Number(e.ExtraHours);

                                    if (dayLetter === 'L') { weekData.L.norm += Number(e.RegularHours); weekData.L.extra += Number(e.ExtraHours); }
                                    if (dayLetter === 'M') {
                                      const dayOfMonth = new Date(e.WorkDate).getUTCDate();
                                      const startDay = new Date(period.StartDate).getUTCDate();
                                      if (dayOfMonth === startDay + 1 || (dayOfMonth < startDay && dayOfMonth === 1)) {
                                         weekData.M.norm += Number(e.RegularHours); weekData.M.extra += Number(e.ExtraHours);
                                      } else {
                                         weekData.M2.norm += Number(e.RegularHours); weekData.M2.extra += Number(e.ExtraHours);
                                      }
                                    }
                                    if (dayLetter === 'J') { weekData.J.norm += Number(e.RegularHours); weekData.J.extra += Number(e.ExtraHours); }
                                    if (dayLetter === 'V') { weekData.V.norm += Number(e.RegularHours); weekData.V.extra += Number(e.ExtraHours); }
                                    if (dayLetter === 'S') { weekData.S.norm += Number(e.RegularHours); weekData.S.extra += Number(e.ExtraHours); }
                                    if (dayLetter === 'D') { weekData.D.norm += Number(e.RegularHours); weekData.D.extra += Number(e.ExtraHours); }
                                  });

                                  const renderCell = (norm: number, extra: number) => {
                                    if (norm === 0 && extra === 0) return <span className="text-gray-300">-</span>;
                                    return (
                                      <div className="flex flex-col items-center">
                                        {norm > 0 ? <span>{norm}</span> : <span>0</span>}
                                        {extra > 0 && <span>{extra}</span>}
                                      </div>
                                    );
                                  };

                                  return (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors border-b border-gray-300">
                                      <td className="py-3 px-4">{idx + 1}</td>
                                      <td className="py-3 px-4">{name}</td>
                                      <td className="py-3 px-4">{position}</td>
                                      <td className="py-3 px-4 text-center">
                                        {salaryIMSS ? formatCurrencyNumber(salaryIMSS) : '—'}
                                        </td>
                                      <td className="py-3 px-4 text-center">
                                        <div className="text-sm text-gray-800 max-w-[150px] truncate">
                                        {renderCell(weekData.L.norm, weekData.L.extra)}
                                        </div>
                                        </td>
                                      <td className="py-3 px-4 text-center">{renderCell(weekData.M.norm, weekData.M.extra)}</td>
                                      <td className="py-3 px-4 text-center">{renderCell(weekData.M2.norm, weekData.M2.extra)}</td>
                                      <td className="py-3 px-4 text-center">{renderCell(weekData.J.norm, weekData.J.extra)}</td>
                                      <td className="py-3 px-4 text-center">{renderCell(weekData.V.norm, weekData.V.extra)}</td>
                                      <td className="py-3 px-4 text-center">{renderCell(weekData.S.norm, weekData.S.extra)}</td>
                                      <td className="py-3 px-4 text-center">{renderCell(weekData.D.norm, weekData.D.extra)}</td>
                                      <td className="py-3 px-4 text-center">{totalDiasTrabajados}</td>
                                      <td className="py-3 px-4 text-center">{totalHorasExtra > 0 ? totalHorasExtra : '0'}</td>
                                      <td className="py-3 px-4 text-center">
                                        {workerEntries.length > 0 ? (
                                          <button
                                            onClick={() => setDayModal({ isOpen: true, workerName: name, entries: workerEntries, isClosed })}
                                            className="px-3 py-4 bg-gray-200 text-gray-700 text-xs font-bold rounded hover:bg-gray-300 transition-colors"
                                          >
                                            VER DÍAS
                                          </button>
                                        ) : (
                                          <span className="text-xs text-gray-400">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />

      <style jsx global>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-spin { animation: spin 1s linear infinite; }
        body { padding-top: 0; padding-bottom: 0; margin: 0; overflow-x: hidden; }
        header, footer { z-index: 50 !important; }
        body.modal-open { overflow: hidden; }
        textarea { resize: none; }
      `}</style>
    </div>
  );
}