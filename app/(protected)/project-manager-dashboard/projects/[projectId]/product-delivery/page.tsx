'use client';

import AppHeader from '@/components/header/3/3.1';
import Footer from '@/components/footer';
import { useSessionManager } from '@/hooks/useSessionManager/3';
import { useInactivityManager } from '@/hooks/useInactivityManager';
import { useState, useEffect, useCallback, use, ChangeEvent, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, ChevronLeft, ChevronRight, Edit, Trash2, X, RefreshCw,
  CheckCircle, AlertCircle, FileText, Download, Plus,
} from 'lucide-react';

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

interface EPCRecord {
  EPCID: number;
  ProjectID: number;
  Advance: number | null;
  Amount: number | null;
  WeekNumber: number | null;
  EstimateNumber: number | null;
  Date: string | null;
}

interface EPCEditData {
  epcId: number;
  advance: string;
  amount: string;
  weekNumber: string;
  estimateNumber: string;
  date: string;
}

interface PageProps {
  params: Promise<{ projectId: string }>;
}

// ============ UTILIDADES ============

const normalizarMayusculas = (t: string) => t.toUpperCase();

const formatPercentage = (advance: number | null) => {
  if (advance === null || advance === undefined) return '-';
  return `${Number(advance).toFixed(2)}%`;
};

const formatAmount = (amount: number | null) => {
  if (amount === null || amount === undefined) return '-';
  return Number(amount).toFixed(3);
};

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return '-';
  // Si ya es string YYYY-MM-DD (o ISO), extraemos la parte de fecha
  const str = typeof value === 'string' ? value : value.toISOString();
  const datePart = str.split('T')[0];
  // Formatear a DD/MM/YYYY para mostrar
  const parts = datePart.split('-');
  if (parts.length !== 3) return datePart;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// Convierte cualquier valor de fecha a YYYY-MM-DD para inputs type="date"
const toInputDate = (value: string | Date | null | undefined) => {
  if (!value) return '';
  const str = typeof value === 'string' ? value : value.toISOString();
  return str.split('T')[0];
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
    switch (type) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error': return <AlertCircle className="h-5 w-5 text-red-600" />;
      default: return <AlertCircle className="h-5 w-5 text-blue-600" />;
    }
  };
  const getBgColor = () => {
    switch (type) {
      case 'success': return 'bg-green-100';
      case 'error': return 'bg-red-100';
      default: return 'bg-blue-100';
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
        <div className="p-6">
          <div className="flex items-center space-x-3">
            <div className={`flex items-center justify-center w-10 h-10 ${getBgColor()} rounded-full`}>
              {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h3>
              <div className="mt-1">
                <p className="text-sm text-gray-600 leading-5">{message}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-gray-400 hover:text-gray-500 transition-colors duration-200 bg-gray-100 hover:bg-gray-200 rounded-full p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors"
            >
              ACEPTAR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ DELETE MODAL ============

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  registro: EPCRecord | null;
  isDeleting: boolean;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ isOpen, onClose, onConfirm, registro, isDeleting }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            CONFIRMAR ELIMINACIÓN
          </h2>
          <p className="text-sm text-gray-600 mt-2 leading-5">
            ¿Está seguro que desea eliminar el registro EPC{' '}
            <span className="font-bold">#{registro?.EPCID}</span> de la semana{' '}
            <span className="font-bold">{registro?.WeekNumber ?? '-'}</span>?
          </p>
          <p className="text-sm text-gray-500 mt-2">Esta acción no se puede deshacer.</p>
        </div>
        <div className="p-6 pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center min-w-[100px] disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ELIMINANDO...
              </>
            ) : ('ELIMINAR')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ EDIT MODAL ============

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  registro: EPCRecord | null;
  onSave: (data: EPCEditData) => Promise<void> | void;
  isSaving: boolean;
}

const EditModal: React.FC<EditModalProps> = ({ isOpen, onClose, registro, onSave, isSaving }) => {
  const [form, setForm] = useState({ advance: '', amount: '', weekNumber: '', estimateNumber: '', date: '' });

  useEffect(() => {
    if (registro) {
      setForm({
        advance: String(registro.Advance ?? ''),
        amount: String(registro.Amount ?? ''),
        weekNumber: String(registro.WeekNumber ?? ''),
        estimateNumber: String(registro.EstimateNumber ?? ''),
        date: toInputDate(registro.Date),
      });
    }
  }, [registro]);

  if (!isOpen || !registro) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave({
      epcId: registro.EPCID,
      advance: form.advance,
      amount: form.amount,
      weekNumber: form.weekNumber,
      estimateNumber: form.estimateNumber,
      date: form.date,
    });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">
              EDITAR REGISTRO
            </h2>
            <p className="text-gray-600 mt-1 text-sm">Modifique la información del registro.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
              INFORMACIÓN DEL REGISTRO
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  AVANCE (%) *
                </label>
                <input
                  type="number"
                  name="advance"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.advance}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  CANTIDAD *
                </label>
                <input
                  type="number"
                  name="amount"
                  step="0.001"
                  min="0"
                  value={form.amount}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  NÚMERO DE SEMANA *
                </label>
                <input
                  type="number"
                  name="weekNumber"
                  step="1"
                  min="1"
                  value={form.weekNumber}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  NÚMERO DE ESTIMACIÓN *
                </label>
                <input
                  type="number"
                  name="estimateNumber"
                  step="1"
                  min="1"
                  value={form.estimateNumber}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  FECHA *
                </label>
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-300 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center min-w-[140px] disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  GUARDANDO...
                </>
              ) : ('GUARDAR CAMBIOS')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============ ADD MODAL ============

interface AddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<EPCEditData, 'epcId'>) => Promise<void> | void;
  isSubmitting: boolean;
}

const AddModal: React.FC<AddModalProps> = ({ isOpen, onClose, onSave, isSubmitting }) => {
  const [form, setForm] = useState({ advance: '', amount: '', weekNumber: '', estimateNumber: '', date: '' });

  const handleClose = () => {
    setForm({ advance: '', amount: '', weekNumber: '', estimateNumber: '', date: '' });
    onClose();
  };

  useEffect(() => {
    if (isOpen) setForm({ advance: '', amount: '', weekNumber: '', estimateNumber: '', date: '' });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave({
      advance: form.advance,
      amount: form.amount,
      weekNumber: form.weekNumber,
      estimateNumber: form.estimateNumber,
      date: form.date,
    });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">NUEVO REGISTRO</h2>
            <p className="text-gray-600 mt-1 text-sm">Complete la información.</p>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
              INFORMACIÓN DEL REGISTRO
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  AVANCE (%) *
                </label>
                <input
                  type="number"
                  name="advance"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.advance}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  CANTIDAD *
                </label>
                <input
                  type="number"
                  name="amount"
                  step="0.001"
                  min="0"
                  value={form.amount}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  NO. DE SEMANA *
                </label>
                <input
                  type="number"
                  name="weekNumber"
                  step="1"
                  min="1"
                  value={form.weekNumber}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  NO. DE ESTIMACIÓN *
                </label>
                <input
                  type="number"
                  name="estimateNumber"
                  step="1"
                  min="1"
                  value={form.estimateNumber}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  FECHA *
                </label>
                <input
                  type="date"
                  name="date"
                  value={form.date}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  required
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-300 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="bg-gray-200 text-black font-bold py-2.5 px-6 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center min-w-[150px] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  GUARDANDO...
                </>
              ) : ('GUARDAR REGISTRO')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============ COMPONENTE PRINCIPAL ============

export default function EPCPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('projectId');
  const { projectId: paramProjectId } = use(params);
  const projectId = urlProjectId || paramProjectId;

  const { user, loading: sessionLoading } = useSessionManager();
  useInactivityManager();

  // Estados generales
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Datos
  const [records, setRecords] = useState<EPCRecord[]>([]);
  const [currentProject, setCurrentProject] = useState<{ projectName: string } | null>(null);
  const [userData, setUserData] = useState<UserData>({
    id: 0, usuario: '', tipoUsuario: '', nombre: '', apellido: '', email: '',
    proyectoAsignado: '', proyectoActivo: false, projectId: null,
  });

  // Modales
  const [modal, setModal] = useState({
    isOpen: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info',
  });
  const [addModal, setAddModal] = useState({ isOpen: false, isSubmitting: false });
  const [editModal, setEditModal] = useState({ isOpen: false, registro: null as EPCRecord | null, isSaving: false });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, registro: null as EPCRecord | null, isDeleting: false });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // ============ HELPERS ============

  const showModal = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModal({ isOpen: true, title, message, type });
    if (type === 'success') {
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3500);
    } else if (type === 'error') {
      setError(message);
    }
  };

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' });
    setError('');
  };

  // ============ FETCHES ============

  const fetchRecords = useCallback(async () => {
    if (!projectId) return;
    setIsFetching(true);
    try {
      const res = await fetch(`/api/project-manager/projects/epc?projectId=${projectId}`);
      if (!res.ok) throw new Error('Error al obtener registros');
      const result = await res.json();
      setRecords(result.success ? result.data : []);
    } catch (err) {
      console.error('Error al obtener registros EPC:', err);
      setRecords([]);
      showModal('Error', 'Error al obtener registros EPC', 'error');
    } finally {
      setIsFetching(false);
    }
  }, [projectId]);

  const fetchUserData = useCallback(async () => {
    try {
      const res = await fetch('/api/project-manager/auth/sessions');
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        if (projectId) {
          try {
            const pr = await fetch(`/api/project-manager/projects/get-project-name?projectId=${projectId}`);
            if (pr.ok) {
              const pd = await pr.json();
              setCurrentProject(pd);
            }
          } catch (e) { console.error(e); }
        } else {
          showModal('Error', 'No se especificó un proyecto en la URL', 'error');
          router.push('/project-manager-dashboard/projects');
          return;
        }
      } else {
        router.push('/');
      }
    } catch (err) {
      console.error('Error al obtener datos de usuario:', err);
      router.push('/');
    } finally {
      setLoading(false);
    }
  }, [router, projectId]);

  useEffect(() => {
    if (user && projectId) {
      fetchRecords();
      fetchUserData();
    }
  }, [user, projectId, fetchRecords, fetchUserData]);

  // ============ CRUD HANDLERS ============

  const handleAdd = async (data: Omit<EPCEditData, 'epcId'>) => {
    if (!projectId) return;
    const advanceNum = Number(data.advance);
    const amountNum = Number(data.amount);
    const weekNum = Number(data.weekNumber);
    const estimateNum = Number(data.estimateNumber);

    if (!Number.isFinite(advanceNum) || advanceNum < 0 || advanceNum > 100) {
      showModal('Error', 'El avance debe estar entre 0 y 100', 'error'); return;
    }
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      showModal('Error', 'El monto debe ser un número positivo', 'error'); return;
    }
    if (!Number.isInteger(weekNum) || weekNum <= 0) {
      showModal('Error', 'El número de semana debe ser un entero positivo', 'error'); return;
    }
    if (!Number.isInteger(estimateNum) || estimateNum <= 0) {
      showModal('Error', 'El número de estimación debe ser un entero positivo', 'error'); return;
    }
    if (!data.date) {
      showModal('Error', 'La fecha es obligatoria', 'error'); return;
    }

    setAddModal((p) => ({ ...p, isSubmitting: true }));
    try {
      const res = await fetch('/api/project-manager/projects/epc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: Number(projectId),
          advance: advanceNum,
          amount: amountNum,
          weekNumber: weekNum,
          estimateNumber: estimateNum,
          date: data.date,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Error al crear EPC');
      showModal('Éxito', '¡REGISTRO GUARDADO EXITOSAMENTE!', 'success');
      setAddModal({ isOpen: false, isSubmitting: false });
      await fetchRecords();
    } catch (err: any) {
      showModal('Error', err.message || 'Error al crear EPC', 'error');
      setAddModal((p) => ({ ...p, isSubmitting: false }));
    }
  };

  const handleEdit = async (data: EPCEditData) => {
    if (!projectId) return;
    const advanceNum = Number(data.advance);
    const amountNum = Number(data.amount);
    const weekNum = Number(data.weekNumber);
    const estimateNum = Number(data.estimateNumber);

    if (!Number.isFinite(advanceNum) || advanceNum < 0 || advanceNum > 100) {
      showModal('Error', 'El avance debe estar entre 0 y 100', 'error'); return;
    }
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      showModal('Error', 'El monto debe ser un número positivo', 'error'); return;
    }
    if (!Number.isInteger(weekNum) || weekNum <= 0) {
      showModal('Error', 'El número de semana debe ser un entero positivo', 'error'); return;
    }
    if (!Number.isInteger(estimateNum) || estimateNum <= 0) {
      showModal('Error', 'El número de estimación debe ser un entero positivo', 'error'); return;
    }
    if (!data.date) {
      showModal('Error', 'La fecha es obligatoria', 'error'); return;
    }

    setEditModal((p) => ({ ...p, isSaving: true }));
    try {
      const res = await fetch('/api/project-manager/projects/epc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epcId: data.epcId,
          projectId: Number(projectId),
          advance: advanceNum,
          amount: amountNum,
          weekNumber: weekNum,
          estimateNumber: estimateNum,
          date: data.date,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Error al actualizar EPC');
      showModal('Éxito', '¡REGISTRO ACTUALIZADO EXITOSAMENTE!', 'success');
      setEditModal({ isOpen: false, registro: null, isSaving: false });
      await fetchRecords();
    } catch (err: any) {
      showModal('Error', err.message || 'Error al actualizar EPC', 'error');
      setEditModal((p) => ({ ...p, isSaving: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.registro) return;
    setDeleteModal((p) => ({ ...p, isDeleting: true }));
    try {
      const res = await fetch(
        `/api/project-manager/projects/epc?epcId=${deleteModal.registro.EPCID}`,
        { method: 'DELETE' }
      );
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Error al eliminar EPC');
      showModal('Éxito', '¡REGISTRO ELIMINADO EXITOSAMENTE!', 'success');
      setDeleteModal({ isOpen: false, registro: null, isDeleting: false });
      await fetchRecords();
    } catch (err: any) {
      showModal('Error', err.message || 'Error al eliminar EPC', 'error');
      setDeleteModal((p) => ({ ...p, isDeleting: false }));
    }
  };

  const downloadReport = async (epcId?: number) => {
    if (!projectId) return;
    setIsGeneratingReport(true);
    try {
      const url = epcId
        ? `/api/download/edit/EPC?projectId=${projectId}&epcId=${epcId}`
        : `/api/download/edit/EPC?projectId=${projectId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al generar archivo');
      const blob = await res.blob();
      const urlObject = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const projectName = currentProject?.projectName || userData.proyectoAsignado || 'proyecto';
      const safe = projectName.replace(/\s+/g, '_').toLowerCase();
      const fileName = safe !== 'ningún_proyecto_asignado'
        ? `FT-GP-002_${safe}${epcId ? `_EPC${epcId}` : ''}`
        : `FT-GP-002${epcId ? `_EPC${epcId}` : ''}`;
      a.href = urlObject;
      a.download = `${fileName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(urlObject);
      showModal('Éxito', '¡ARCHIVO GENERADO Y DESCARGADO EXITOSAMENTE!', 'success');
    } catch (err) {
      console.error('Error al descargar:', err);
      showModal('Error', 'Error al generar el archivo', 'error');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // ============ FILTRADO / PAGINACIÓN ============

  const filtered = records.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      String(r.WeekNumber ?? '').includes(term) ||
      String(r.EstimateNumber ?? '').includes(term) ||
      formatDate(r.Date).toLowerCase().includes(term)
    );
  });

  useEffect(() => {
    setTotalPages(Math.max(1, Math.ceil(filtered.length / itemsPerPage)));
    setCurrentPage(1);
  }, [filtered.length, itemsPerPage]);

  const currentRecords = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // ============ LOADING / SESSION ============

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

  // ============ RENDER ============

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader title="PANEL DE ADMINISTRACIÓN DE PROYECTOS" />

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, registro: null, isDeleting: false })}
        onConfirm={handleDelete}
        registro={deleteModal.registro}
        isDeleting={deleteModal.isDeleting}
      />

      <EditModal
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ isOpen: false, registro: null, isSaving: false })}
        registro={editModal.registro}
        onSave={handleEdit}
        isSaving={editModal.isSaving}
      />

      <AddModal
        isOpen={addModal.isOpen}
        onClose={() => setAddModal({ isOpen: false, isSubmitting: false })}
        onSave={handleAdd}
        isSubmitting={addModal.isSubmitting}
      />

      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />

      <main className="pt-[72px] pb-[80px] min-h-screen bg-gray-100">
        <div className="w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto">

          {/* Header de la página */}
          <div className="mb-6">
            <div className="bg-[#3a6ea5] p-4 rounded-lg shadow border border-[#3a6ea5]">
              <h1 className="text-xl font-bold text-white tracking-tight">
                ENTREGA DE PRODUCTO AL CLIENTE
              </h1>
              <p className="text-sm text-gray-200 mt-1">
                Administre los registros y genere el formato de entrega.
              </p>
            </div>
          </div>

          {/* Mensajes */}
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

          {/* Toolbar */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por semana, estimación o fecha..."
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
              onClick={() => { setSearchTerm(''); fetchRecords(); }}
              className="px-4 py-2.5 bg-gray-200 text-black font-bold rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              ACTUALIZAR
            </button>

            <button
              onClick={() => setAddModal({ isOpen: true, isSubmitting: false })}
              className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center whitespace-nowrap"
            >
              <Plus className="h-4 w-4 mr-2" />
              NUEVO REGISTRO
            </button>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-lg shadow border border-gray-300 overflow-hidden">
            <div className="overflow-x-auto">
              {isFetching ? (
                <div className="flex justify-center items-center py-12">
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3a6ea5] mb-2"></div>
                    <p className="text-gray-600">Cargando registros...</p>
                  </div>
                </div>
              ) : currentRecords.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-3 px-4 text-left text-sm font-bold text-gray-700 uppercase border-b border-gray-300">EPCID</th>
                      <th className="py-3 px-4 text-right text-sm font-bold text-gray-700 uppercase border-b border-gray-300">AVANCE</th>
                      <th className="py-3 px-4 text-right text-sm font-bold text-gray-700 uppercase border-b border-gray-300">MONTO</th>
                      <th className="py-3 px-4 text-center text-sm font-bold text-gray-700 uppercase border-b border-gray-300">SEMANA</th>
                      <th className="py-3 px-4 text-center text-sm font-bold text-gray-700 uppercase border-b border-gray-300">NO. ESTIMACIÓN</th>
                      <th className="py-3 px-4 text-center text-sm font-bold text-gray-700 uppercase border-b border-gray-300">FECHA</th>
                      <th className="py-3 px-4 text-center text-sm font-bold text-gray-700 uppercase border-b border-gray-300">ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRecords.map((r) => (
                      <tr key={r.EPCID} className="hover:bg-gray-50 transition-colors border-b border-gray-300">
                        <td className="py-3 px-4 text-sm text-gray-800 font-medium text-right">
                          {r.EPCID}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-800 font-medium text-right">
                          {formatPercentage(r.Advance)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-800 font-medium text-right">
                          {formatAmount(r.Amount)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-800 font-medium text-right">
                          {r.WeekNumber ?? '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-800 font-medium text-center">
                          {r.EstimateNumber ?? '-'}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-800 font-medium text-center">
                          {formatDate(r.Date)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => downloadReport(r.EPCID)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                              title="Descargar este EPC"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditModal({ isOpen: true, registro: r, isSaving: false })}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteModal({ isOpen: true, registro: r, isDeleting: false })}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-bold text-gray-900">NO HAY REGISTROS</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {searchTerm
                      ? 'No se encontraron registros que coincidan con tu búsqueda.'
                      : 'No se han encontrado registros de EPC.'}
                  </p>
                </div>
              )}
            </div>

            {/* Paginación */}
            {filtered.length > 0 && totalPages > 1 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-300 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  MOSTRANDO {((currentPage - 1) * itemsPerPage) + 1} -{' '}
                  {Math.min(currentPage * itemsPerPage, filtered.length)} DE {filtered.length} REGISTROS
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-4 py-2 bg-[#3a6ea5] text-white rounded-md">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
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