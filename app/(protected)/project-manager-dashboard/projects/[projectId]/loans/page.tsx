// src/app/project-manager-dashboard/projects/[projectId]/loans/page.tsx
'use client';

import AppHeader from '@/components/header/3/3.1';
import Footer from '@/components/footer';
import { useSessionManager } from '@/hooks/useSessionManager/3';
import { useInactivityManager } from '@/hooks/useInactivityManager';
import { useState, useEffect, useCallback, ChangeEvent, FormEvent, use } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Edit, Trash2, X, RefreshCw, CheckCircle, AlertCircle, FileText, Users, Download, ChevronLeft, ChevronRight } from 'lucide-react';

// ============ INTERFACES ============

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

interface WorkerOption {
  ProjectPersonnelID: number;
  FullName: string;
}

interface LoanData {
  date: Date | null;
  projectPersonnelId: string;
  methodId: string;
  total: number;
  formattedTotal?: string;
  firstDiscount: Date | null;
  numberOfPayments: number | null;
  observations: string;
}

interface LoanRecord {
  id: number;
  projectPersonnelId: string;
  employeeName: string;
  methodId: string;
  date: string;
  total: number;
  formattedTotal?: string;
  firstDiscount: string;
  numberOfPayments: number | null;
  observations: string;
  status: number;
  archivos: ArchivoAdjunto[];
  totalCuotas: number;
  cuotasPagadas: number;
  cuotasVencidas: number;
  montoPagado: number;
  progreso: string;
}

interface ArchivoAdjunto {
  nombre: string;
  url: string;
  tipo: string;
  key: string;
}

interface PaymentMethod {
  methodId: number;
  methodName: string;
}

interface PageProps {
  params: Promise<{ projectId: string }>;
}

// ============ HELPERS ============

const normalizarMayusculas = (t: string) => t.toUpperCase();

const formatCurrency = (value: string): string => {
  const num = value.replace(/[^0-9.]/g, '');
  if (!num) return '';
  const parts = num.split('.');
  if (parts.length > 2) return `${parts[0]}.${parts[1]}`;
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
};

const parseCurrency = (value: string): number =>
  parseFloat(value.replace(/,/g, '')) || 0;

// Fecha SIN timezone shift
const formatDate = (dateString: string): string => {
  if (!dateString) return '—';
  const str = String(dateString);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  try {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${d}/${m}/${y}`;
    }
  } catch {}
  return str;
};

const formatCurrencyNumber = (amount: number): string => {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 2
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

const getPdfUrlFromArchivos = (archivos: ArchivoAdjunto[] | undefined): string | null => {
  if (!archivos || archivos.length === 0) return null;
  const pdf = archivos.find(
    a => a.tipo === 'application/pdf' || a.nombre?.toLowerCase().endsWith('.pdf')
  );
  return pdf ? pdf.url : null;
};

// ============ MODAL GENÉRICO ============

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
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full relative z-[10000]">
        <div className="p-6">
          <div className="flex items-center space-x-3">
            <div className={`flex items-center justify-center w-10 h-10 ${getBg()} rounded-full`}>
              {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm text-gray-600 leading-5">{message}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500 bg-gray-100 rounded-full p-1">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={onClose} className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592]">
              ACEPTAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ MODAL DE ÉXITO CON VISTA PREVIA ============

interface SuccessDetails {
  LoanID: number;
  ProjectPersonnelID: number;
  EmployeeName: string;
  ApplicationDate: string;
  Amount: number;
  NumberOfPayments: number;
  FirstDiscountDate: string;
  observations: string;
  isEdit?: boolean;
  pdfUrl: string | null;
}

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: SuccessDetails | null;
}

const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, details }) => {
  const [pdfLoading, setPdfLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!details?.pdfUrl) return;
    try {
      setDownloading(true);
      const res = await fetch(details.pdfUrl);
      if (!res.ok) throw new Error('Error al descargar');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FT-RH-21-PROYECTO-${details.LoanID}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (isOpen) setPdfLoading(true);
  }, [isOpen, details?.LoanID, details?.pdfUrl]);

  if (!isOpen || !details) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70"
      style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full h-[90vh] flex flex-col animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              {details.isEdit ? '¡PRÉSTAMO ACTUALIZADO!' : '¡REGISTRO EXITOSO!'}
            </h2>
            <p className="text-gray-600 mt-1 text-sm">
              {details.isEdit
                ? 'El préstamo ha sido actualizado correctamente.'
                : 'El préstamo ha sido registrado correctamente.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="w-full md:w-1/3 p-6 border-r border-gray-200 overflow-y-auto">
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase">DETALLES DEL REGISTRO</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="block text-xs font-bold text-gray-700 uppercase">ID PRÉSTAMO:</span>
                    <span className="text-gray-600 mt-1 text-sm">{details.LoanID}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="block text-xs font-bold text-gray-700 uppercase">ID EMPLEADO:</span>
                    <span className="text-gray-600 mt-1 text-sm">{details.ProjectPersonnelID}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="block text-xs font-bold text-gray-700 uppercase">EMPLEADO:</span>
                    <span className="text-gray-600 mt-1 text-sm text-right">{details.EmployeeName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="block text-xs font-bold text-gray-700 uppercase">FECHA SOLICITUD:</span>
                    <span className="text-gray-600 mt-1 text-sm">{formatDate(details.ApplicationDate)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase">DOCUMENTO GENERADO</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-gray-600 mr-2" />
                      <span className="block text-xs font-bold text-gray-700 uppercase">FT-RH-21 (PDF)</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDownloadPDF}
                        disabled={downloading || !details.pdfUrl}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Descargar PDF"
                      >
                        {downloading ? (
                          <div className="h-4 w-4 border-2 border-gray-700 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Download className="h-4 w-4 text-gray-700" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 text-sm uppercase">
                VISTA PREVIA - FORMATO FT-RH-21
              </h3>
            </div>

            <div className="flex-1 border border-gray-300 rounded-lg overflow-hidden relative bg-gray-50">
              {!details.pdfUrl ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center text-gray-500">
                    <AlertCircle className="h-10 w-10 mb-2" />
                    <p className="text-sm">No hay documento disponible</p>
                  </div>
                </div>
              ) : (
                <>
                  {pdfLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-gray-300 border-t-[#3a6ea5] animate-spin rounded-full mb-3"></div>
                        <p className="text-sm text-gray-600">Cargando vista previa...</p>
                      </div>
                    </div>
                  )}
                  <iframe
                    src={details.pdfUrl}
                    className="w-full h-full border-0"
                    onLoad={() => setPdfLoading(false)}
                    title="Vista previa del formato FT-RH-21"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ LOAN FORM (sin adjuntar archivos) ============

interface LoanFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
  paymentMethods: PaymentMethod[];
  workers: WorkerOption[];
  initialData?: LoanRecord | null;
}

const LoanFormModal: React.FC<LoanFormModalProps> = ({
  isOpen, mode, onClose, onSave, isSaving, paymentMethods, workers, initialData
}) => {
  const [form, setForm] = useState<LoanData>({
    date: null, projectPersonnelId: '', methodId: '', total: 0, formattedTotal: '',
    firstDiscount: null, numberOfPayments: null, observations: ''
  });
  const [lockedStructure, setLockedStructure] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && initialData) {
      setForm({
        date: initialData.date ? new Date(initialData.date) : null,
        projectPersonnelId: String(initialData.projectPersonnelId || ''),
        methodId: initialData.methodId,
        total: initialData.total,
        formattedTotal: initialData.total.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        firstDiscount: initialData.firstDiscount ? new Date(initialData.firstDiscount) : null,
        numberOfPayments: initialData.numberOfPayments,
        observations: initialData.observations || ''
      });
      setLockedStructure(initialData.cuotasPagadas > 0);
    } else {
      setForm({
        date: null,
        projectPersonnelId: workers[0] ? String(workers[0].ProjectPersonnelID) : '',
        methodId: paymentMethods[0] ? String(paymentMethods[0].methodId) : '',
        total: 0, formattedTotal: '', firstDiscount: null, numberOfPayments: null,
        observations: ''
      });
      setLockedStructure(false);
    }
  }, [isOpen, mode, initialData, workers, paymentMethods]);

  if (!isOpen) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'total') {
      const formatted = formatCurrency(value);
      setForm(p => ({ ...p, total: parseCurrency(formatted), formattedTotal: formatted }));
    } else if (name === 'numberOfPayments') {
      setForm(p => ({ ...p, numberOfPayments: value === '' ? null : parseInt(value) }));
    } else if (name === 'observations') {
      setForm(p => ({ ...p, observations: normalizarMayusculas(value) }));
    } else {
      setForm(p => ({ ...p, [name]: value }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.firstDiscount || !form.projectPersonnelId || !form.numberOfPayments) {
      alert('Completa todos los campos requeridos');
      return;
    }

    await onSave({
      id: initialData?.id,
      projectPersonnelId: Number(form.projectPersonnelId),
      date: form.date.toISOString().split('T')[0],
      firstDiscount: form.firstDiscount.toISOString().split('T')[0],
      methodId: Number(form.methodId),
      total: form.total,
      numberOfPayments: form.numberOfPayments,
      observations: form.observations
    });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {mode === 'create' ? 'NUEVO PRÉSTAMO' : 'EDITAR REGISTRO'}
            </h2>
            {lockedStructure && (
              <p className="text-xs text-amber-700 mt-1">
                Ya hay cuotas pagadas: no puedes cambiar monto, número de pagos ni primera fecha.
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full" disabled={isSaving}>
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
              INFORMACIÓN DEL REGISTRO
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">FECHA DE SOLICITUD *</label>
                <input
                  type="date"
                  value={form.date ? form.date.toISOString().split('T')[0] : ''}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value ? new Date(e.target.value) : null }))}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  disabled={isSaving}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">EMPLEADO *</label>
                <select
                  value={form.projectPersonnelId}
                  onChange={e => setForm(p => ({ ...p, projectPersonnelId: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  disabled={isSaving}
                  required
                >
                  <option value="">SELECCIONA UN EMPLEADO</option>
                  {workers.map(w => (
                    <option key={w.ProjectPersonnelID} value={w.ProjectPersonnelID}>
                      {w.FullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
              DETALLES DEL PAGO
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">TOTAL ($) *</label>
                <input
                  type="text"
                  value={form.formattedTotal || ''}
                  onChange={handleChange}
                  name="total"
                  disabled={lockedStructure || isSaving}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium disabled:bg-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">FECHA 1ER DESCUENTO *</label>
                <input
                  type="date"
                  value={form.firstDiscount ? form.firstDiscount.toISOString().split('T')[0] : ''}
                  onChange={e => setForm(p => ({ ...p, firstDiscount: e.target.value ? new Date(e.target.value) : null }))}
                  disabled={lockedStructure || isSaving}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium disabled:bg-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">NÚMERO DE PAGOS *</label>
                <input
                  type="number"
                  name="numberOfPayments"
                  value={form.numberOfPayments || ''}
                  onChange={handleChange}
                  min="1"
                  disabled={lockedStructure || isSaving}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium disabled:bg-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">PROCEDENCIA *</label>
                <select
                  name="methodId"
                  value={form.methodId}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  disabled={isSaving}
                  required
                >
                  <option value="">SELECCIONA</option>
                  {paymentMethods.map(m => (
                    <option key={m.methodId} value={m.methodId}>{m.methodName}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
              OBSERVACIONES
            </h3>
            <textarea
              name="observations"
              value={form.observations}
              onChange={handleChange}
              rows={3}
              disabled={isSaving}
              className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium resize-none disabled:bg-gray-100"
              placeholder="INGRESE LAS OBSERVACIONES"
            />
          </div>

          <div className="pt-4 border-t border-gray-300 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 disabled:opacity-50">
              CANCELAR
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] flex items-center justify-center min-w-[150px] disabled:opacity-50">
              {isSaving ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />GUARDANDO...</>
              ) : mode === 'create' ? 'GUARDAR REGISTRO' : 'GUARDAR CAMBIOS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============ PÁGINA PRINCIPAL ============

export default function LoansPage({ params }: PageProps) {
  const router = useRouter();
  const { projectId } = use(params);

  const { user, loading: sessionLoading } = useSessionManager();
  useInactivityManager();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [registros, setRegistros] = useState<LoanRecord[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [userData, setUserData] = useState<UserData>({
    id: 0, usuario: '', tipoUsuario: '', nombre: '', apellido: '', email: '',
    proyectoAsignado: '', proyectoActivo: false, projectId: null
  });

  const [modal, setModal] = useState({ isOpen: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' });
  const closeModal = () => setModal({ isOpen: false, title: '', message: '', type: 'info' });
  const showModal = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModal({ isOpen: true, title, message, type });
    if (type === 'success') { setSuccessMessage(message); setTimeout(() => setSuccessMessage(''), 3000); }
    else if (type === 'error') setError(message);
  };

  const [deleteModal, setDeleteModal] = useState({ isOpen: false, registro: null as LoanRecord | null, isDeleting: false });
  const [loanFormModal, setLoanFormModal] = useState({ isOpen: false, mode: 'create' as 'create' | 'edit', registro: null as LoanRecord | null });
  const [successModal, setSuccessModal] = useState<{ isOpen: boolean; details: SuccessDetails | null }>({
    isOpen: false,
    details: null
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const res = await fetch('/api/project-manager/projects/payment-methods');
      if (res.ok) setPaymentMethods(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch(`/api/project-manager/projects/personnel?projectId=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      setWorkers(
        data
          .filter((w: any) => w.Source === 'PROJECT' && w.ProjectPersonnelID)
          .map((w: any) => ({
            ProjectPersonnelID: w.ProjectPersonnelID,
            FullName: w.FullName
          }))
      );
    } catch (e) { console.error(e); }
  }, [projectId]);

  const fetchRegistros = useCallback(async (): Promise<LoanRecord[]> => {
    if (!projectId) return [];
    try {
      setIsFetching(true);
      const res = await fetch(`/api/project-manager/projects/loans?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const mapped: LoanRecord[] = data.map((item: any) => ({
          id: item.LoansID,
          projectPersonnelId: String(item.ProjectPersonnelID || ''),
          employeeName: item.EmployeeName || '—',
          methodId: String(item.MethodID || ''),
          date: item.Date,
          total: parseFloat(item.Total) || 0,
          firstDiscount: item.FirstDiscount,
          numberOfPayments: item.NumberOfPayments,
          observations: item.Observations || '',
          status: item.Status,
          archivos: item.Archivos ? JSON.parse(item.Archivos) : [],
          totalCuotas: item.TotalCuotas,
          cuotasPagadas: item.CuotasPagadas,
          cuotasVencidas: item.CuotasVencidas,
          montoPagado: item.MontoPagado,
          progreso: item.Progreso
        }));
        setRegistros(mapped);
        return mapped;
      }
      return [];
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error al cargar préstamos', 'error');
      return [];
    } finally {
      setIsFetching(false);
    }
  }, [projectId]);

  const fetchUserData = useCallback(async () => {
    try {
      const res = await fetch('/api/project-manager/auth/sessions');
      if (!res.ok) { router.push('/'); return; }
      const data = await res.json();
      setUserData(data);
      if (projectId) {
        await fetchPaymentMethods();
        await fetchWorkers();
      } else {
        router.push('/project-manager-dashboard/projects');
      }
    } catch (e) { router.push('/'); }
    finally { setLoading(false); }
  }, [router, projectId, fetchPaymentMethods, fetchWorkers]);

  useEffect(() => {
    if (user && projectId) {
      fetchUserData();
      fetchRegistros();
    }
  }, [user, projectId, fetchUserData, fetchRegistros]);

  const handleSaveLoan = async (data: any) => {
    const isEdit = loanFormModal.mode === 'edit';
    setIsSaving(true);
    try {
      const url = isEdit
        ? `/api/project-manager/projects/loans?id=${data.id}`
        : '/api/project-manager/projects/loans';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: Number(projectId),
          projectPersonnelId: data.projectPersonnelId,
          date: data.date,
          firstDiscount: data.firstDiscount,
          methodId: data.methodId,
          total: data.total,
          numberOfPayments: data.numberOfPayments,
          observations: data.observations
        })
      });
      let resp: any = null;
      try { resp = await res.json(); } catch { resp = null; }
      if (res.ok) {
        const targetId = isEdit ? data.id : resp.id;

        // Generar PDF (reemplaza el anterior si existe) y guardarlo en Archivos
        try {
          await fetch(
            `/api/project-manager/projects/loans/generate-pdf?loanId=${targetId}&saveUploadThing=1`
          );
        } catch (e) {
          console.error('Error al generar PDF:', e);
        }

        // Recargar para obtener la URL guardada
        const refreshed = await fetchRegistros();
        const freshRecord = refreshed.find(r => r.id === targetId);
        const pdfUrl = getPdfUrlFromArchivos(freshRecord?.archivos);

        const worker = workers.find(w => w.ProjectPersonnelID === data.projectPersonnelId);
        setLoanFormModal({ isOpen: false, mode: 'create', registro: null });
        setSuccessModal({
          isOpen: true,
          details: {
            LoanID: targetId,
            ProjectPersonnelID: data.projectPersonnelId,
            EmployeeName: worker?.FullName || 'Empleado',
            ApplicationDate: data.date,
            Amount: data.total,
            NumberOfPayments: data.numberOfPayments,
            FirstDiscountDate: data.firstDiscount,
            observations: data.observations,
            isEdit,
            pdfUrl
          }
        });
      } else {
        showModal('Error', resp?.message || `Error ${res.status}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error de conexión', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.registro) return;
    setDeleteModal(p => ({ ...p, isDeleting: true }));
    try {
      const res = await fetch(`/api/project-manager/projects/loans?id=${deleteModal.registro.id}`, { method: 'DELETE' });
      let resp: any = null;
      try { resp = await res.json(); } catch { resp = null; }
      if (res.ok) {
        await fetchRegistros();
        showModal('Éxito', 'PRÉSTAMO Y CUOTAS ELIMINADOS', 'success');
      } else {
        showModal('Error', resp?.message || 'Error al eliminar', 'error');
      }
    } catch (e) {
      console.error(e);
      showModal('Error', 'Error de conexión', 'error');
    } finally {
      setDeleteModal({ isOpen: false, registro: null, isDeleting: false });
    }
  };

  const filtered = registros.filter(r =>
    r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.observations.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setTotalPages(Math.max(1, Math.ceil(filtered.length / itemsPerPage)));
    setCurrentPage(1);
  }, [filtered.length, itemsPerPage]);

  const currentRegistros = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
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

      <Modal isOpen={modal.isOpen} onClose={closeModal} title={modal.title} message={modal.message} type={modal.type} />

      <LoanFormModal
        isOpen={loanFormModal.isOpen}
        mode={loanFormModal.mode}
        onClose={() => setLoanFormModal({ isOpen: false, mode: 'create', registro: null })}
        onSave={handleSaveLoan}
        isSaving={isSaving}
        paymentMethods={paymentMethods}
        workers={workers}
        initialData={loanFormModal.registro}
      />

      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal({ isOpen: false, details: null })}
        details={successModal.details}
      />

      {deleteModal.isOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70"
          style={{ margin: 0, top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
            <div className="p-6 pb-4 border-b border-gray-300">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                CONFIRMAR ELIMINACIÓN
              </h2>
              <p className="text-sm text-gray-600 mt-2 leading-5">
                ¿Está seguro que desea eliminar este préstamo? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="p-6 pt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteModal({ isOpen: false, registro: null, isDeleting: false })}
                className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center whitespace-nowrap"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteModal.isDeleting}
                className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center whitespace-nowrap disabled:opacity-50"
              >
                {deleteModal.isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ELIMINANDO...
                  </>
                ) : 'ELIMINAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="pt-[72px] pb-[80px] min-h-screen bg-gray-100">
        <div className="w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto">

          <div className="mb-6">
            <div className="bg-[#3a6ea5] p-4 rounded-lg shadow border border-[#3a6ea5]">
              <h1 className="text-xl font-bold text-white tracking-tight">PRÉSTAMOS</h1>
              <p className="text-sm text-gray-200 mt-1">
                Administre los préstamos a empleados del proyecto y su avance de pagos.
              </p>
            </div>
          </div>

          {successMessage && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 animate-fade-in">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <p className="text-sm font-medium text-gray-600 leading-5">{successMessage}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 animate-fade-in">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                <p className="text-sm font-medium text-gray-600 leading-5">{error}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por empleado u observaciones..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(normalizarMayusculas(e.target.value))}
                  className="w-full pl-10 px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => { setSearchTerm(''); fetchRegistros(); }}
              className="px-4 py-2.5 bg-gray-200 text-black font-bold rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              LIMPIAR
            </button>

            <button
              onClick={() => setLoanFormModal({ isOpen: true, mode: 'create', registro: null })}
              className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center whitespace-nowrap"
            >
              NUEVO REGISTRO
            </button>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-300 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">ID PRÉSTAMO</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">EMPLEADO</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">FECHA SOLICITUD</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">MONTO</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">PAGOS</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">1ER DESCUENTO</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">PROGRESO</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">PAGADO</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">DOCUMENTOS</th>
                    <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300 text-center">ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3a6ea5] mb-2"></div>
                          <p className="text-gray-600">Cargando préstamos...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <div className="py-12 text-center">
                          <FileText className="mx-auto h-12 w-12 text-gray-400" />
                          <h3 className="mt-2 text-sm font-bold text-gray-900">NO HAY REGISTROS</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {searchTerm 
                              ? 'No se encontraron registros que coincidan con tu búsqueda.' 
                              : 'No se han encontrado registros de EPP.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentRegistros.map((r) => {
                      const pdfUrl = getPdfUrlFromArchivos(r.archivos);
                      return (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors border-b border-gray-300">
                          <td className="py-3 px-4 text-sm text-gray-800 font-medium">{r.id}</td>
                          <td className="py-3 px-4">
                            <div className="text-sm font-medium text-gray-800 uppercase">{r.employeeName}</div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-800">{formatDate(r.date)}</td>
                          <td className="py-3 px-4 text-sm text-gray-800 font-medium">{formatCurrencyNumber(r.total)}</td>
                          <td className="py-3 px-4 text-sm text-gray-800">{r.numberOfPayments}</td>
                          <td className="py-3 px-4 text-sm text-gray-800">{formatDate(r.firstDiscount)}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                              r.cuotasPagadas === r.totalCuotas && r.totalCuotas > 0
                                ? 'bg-green-100 text-green-800'
                                : r.cuotasVencidas > 0
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {r.progreso}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-800 font-medium">{formatCurrencyNumber(r.montoPagado)}</td>
                          <td className="py-3 px-4">
                            {pdfUrl ? (
                              <a
                                href={pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-gray-700 hover:underline"
                                title="Ver PDF"
                              >
                                Ver
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">Sin documentos</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              {r.status === 1 ? (
                                <span className="px-3 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">
                                  VALIDADO
                                </span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setLoanFormModal({ isOpen: true, mode: 'edit', registro: r })}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                    title="Editar préstamo"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteModal({ isOpen: true, registro: r, isDeleting: false })}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    title="Eliminar préstamo"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && totalPages > 1 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-300 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  MOSTRANDO {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filtered.length)} DE {filtered.length} REGISTROS
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-4 py-2 bg-[#3a6ea5] text-white rounded-md">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-spin { animation: spin 1s linear infinite; }
        body { padding-top: 0; padding-bottom: 0; margin: 0; overflow-x: hidden; }
        .fixed.inset-0.z-\\[9999\\] { z-index: 9999 !important; }
        header, footer { z-index: 50 !important; }
        body.modal-open { overflow: hidden; }
        textarea { resize: none; }
      `}</style>
    </div>
  );
}