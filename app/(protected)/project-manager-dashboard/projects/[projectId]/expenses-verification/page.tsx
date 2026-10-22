'use client';

import { Suspense, useEffect, useState, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppHeader from '@/components/header/3/3.1';
import Footer from '@/components/footer';
import { useSessionManager } from '@/hooks/useSessionManager/3';
import { useInactivityManager } from '@/hooks/useInactivityManager';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

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

interface PageProps {
  params: Promise<{
    projectId: string;
  }>;
}

// ============ MODAL CONSISTENTE ============

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
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-blue-600" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-100';
      case 'error':
        return 'bg-red-100';
      default:
        return 'bg-blue-100';
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

// ============ COMPONENTE PRINCIPAL (SUSPENSE WRAPPER) ============

export default function ExpensesVerificationPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3a6ea5] mx-auto"></div>
            <p className="mt-4 text-gray-700 font-medium">Cargando...</p>
          </div>
        </div>
      }
    >
      <ExpensesVerificationContent params={params} />
    </Suspense>
  );
}

// ============ CONTENIDO PRINCIPAL ============

function ExpensesVerificationContent({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('projectId');

  const { projectId: paramProjectId } = use(params);

  const projectId = urlProjectId || paramProjectId;

  const { user, loading: sessionLoading } = useSessionManager();
  useInactivityManager();

  const [selectedDate, setSelectedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>('');

  // Estados para los checkboxes
  const [mostrarDeposito, setMostrarDeposito] = useState(false);
  const [mostrarCajaChica, setMostrarCajaChica] = useState(false);
  const [mostrarSaldoAnterior, setMostrarSaldoAnterior] = useState(false);
  const [currentProject, setCurrentProject] = useState<{ projectName: string } | null>(null);

  // Campos para caja chica, depósito y saldo anterior
  const [fechaCajaChica, setFechaCajaChica] = useState('');
  const [montoCajaChica, setMontoCajaChica] = useState('');
  const [fechaDeposito, setFechaDeposito] = useState('');
  const [montoDeposito, setMontoDeposito] = useState('');
  const [fechaSaldoAnterior, setFechaSaldoAnterior] = useState('');
  const [montoSaldoAnterior, setMontoSaldoAnterior] = useState('');

  const [userData, setUserData] = useState<UserData>({
    id: 0,
    usuario: '',
    tipoUsuario: '',
    nombre: '',
    apellido: '',
    email: '',
    proyectoAsignado: '',
    proyectoActivo: false,
    projectId: null
  });

  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info'
  });

  const showModal = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModal({ isOpen: true, title, message, type });
  };

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '', type: 'info' });
  };

  const fetchProjectName = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/project-manager/projects/expenses-verification/inquiry/projects?projectId=${pid}`);
      if (!res.ok) throw new Error(`Error fetching project: ${res.status}`);
      const data = await res.json();

      let name = '';
      if (Array.isArray(data)) {
        const found = data.find((p: any) => String(p.ProjectID) === String(pid));
        name = found?.NameProject || '';
      } else if (data && typeof data === 'object') {
        name = data.NameProject || data.projectName || '';
      }
      setProjectName(name);
    } catch (error) {
      console.error('Error fetching project name:', error);
      setProjectName('');
    }
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/validate-session', {
        credentials: 'include'
      });

      if (!response.ok) {
        router.replace('/');
        return;
      }

      const data = await response.json();

      if (!data?.valid || !data?.user) {
        router.replace('/');
        return;
      }

      setUserData({
        id: data.user.SystemUserID || 0,
        usuario: data.user.UserName || '',
        tipoUsuario: data.role?.toString() || '',
        nombre: data.user.UserName || '',
        apellido: '',
        email: '',
        proyectoAsignado: '',
        proyectoActivo: true,
        projectId: null
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchCurrentProject = useCallback(async (projectId: string) => {
    try {
      const response = await fetch(`/api/project-manager/projects/get-project-name?projectId=${projectId}`);
      if (response.ok) {
        const projectData = await response.json();
        setCurrentProject(projectData);
      }
    } catch (error) {
      console.error('Error al obtener proyecto:', error);
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading) {
      (async () => {
        await fetchUserData();
        if (projectId) {
          await fetchProjectName(projectId);
          await fetchCurrentProject(projectId); // 👈 CORREGIDO: ahora sí se llama
        }
      })();
    }
  }, [sessionLoading, fetchUserData, fetchProjectName, fetchCurrentProject, projectId]);

  const handleDownload = async () => {
    if (!projectId) {
      showModal('Atención', 'No se ha especificado un proyecto en la URL', 'error');
      return;
    }
    if (!selectedDate) {
      showModal('Atención', 'Selecciona una fecha del reporte', 'error');
      return;
    }
    if (!startDate) {
      showModal('Atención', 'Selecciona la fecha de inicio del período', 'error');
      return;
    }
    if (!endDate) {
      showModal('Atención', 'Selecciona la fecha de término del período', 'error');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      showModal('Atención', 'La fecha de inicio no puede ser mayor a la fecha de término', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/project-manager/projects/expenses-verification/excel/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: Number(projectId),
          date: selectedDate,
          startDate,
          endDate,
          fechaDeposito: fechaDeposito || null,
          montoDeposito: montoDeposito !== '' ? montoDeposito : null,
          fechaCajaChica: fechaCajaChica || null,
          montoCajaChica: montoCajaChica !== '' ? montoCajaChica : null,
          fechaSaldoAnterior: fechaSaldoAnterior || null,
          montoSaldoAnterior: montoSaldoAnterior !== '' ? montoSaldoAnterior : null
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al generar el archivo');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const projectNameForFile = currentProject?.projectName || projectName || userData.proyectoAsignado || 'proyecto';

      const a = document.createElement('a');
      a.href = url;

      const projectNameSafe = (projectNameForFile || `proyecto_${projectId}`)
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();

      a.download = `FT-CP-003_${projectNameSafe}.xlsx`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showModal('Éxito', 'Reporte generado correctamente', 'success');
    } catch (error: any) {
      console.error('Error:', error);
      showModal('Error', error?.message || 'Error al generar el archivo', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const isFormInvalid = !projectId || !selectedDate || !startDate || !endDate;

  // 👇 CORREGIDO: múltiples fallbacks y normalización segura
  const displayProjectName =
    currentProject?.projectName ||
    projectName ||
    userData.proyectoAsignado ||
    '';

  const hasProjectInfo =
    (displayProjectName && displayProjectName !== 'Ningún proyecto asignado') ||
    !!projectId;

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

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader title="PANEL DE ADMINISTRACIÓN DE PROYECTOS" />

      <Modal
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />

      <main className="pt-[72px] pb-[80px] min-h-screen bg-gray-100">
        <div className="w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto">

          <div className="mb-6">
            <div className="bg-[#3a6ea5] p-4 rounded-lg shadow border border-[#3a6ea5]">
              <h1 className="text-xl font-bold text-white tracking-tight">
                GENERAR COMPROBANTE DE GASTOS
              </h1>
              <p className="text-sm text-gray-200 mt-1">
                Define los parámetros del comprobante para el proyecto seleccionado.
              </p>
            </div>
          </div>

          {/* Panel Principal */}
          <div className="bg-white rounded-lg shadow border border-gray-300 overflow-hidden">
            <div className="p-6">
              {/* 👇 CORREGIDO: condición y render seguros */}
              {hasProjectInfo && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-300">
                  <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase border-b border-gray-200 pb-2">
                    INFORMACIÓN DEL PROYECTO
                  </h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {displayProjectName
                          ? displayProjectName.toUpperCase()
                          : 'PROYECTO SIN NOMBRE'}
                      </p>
                      {projectId && (
                        <p className="text-xs text-gray-500 mt-1">
                          ID: {projectId}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Fecha del Reporte */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2 flex items-center">
                  FILTROS
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                      Fecha *
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Período a Comprobar */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
                  PERÍODO A COMPROBAR
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                      Fecha de Inicio *
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      max={endDate || undefined}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                      Fecha de Término *
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate || undefined}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Sección de Checkboxes */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase border-b border-gray-200 pb-2">
                  INFORMACIÓN ADICIONAL (OPCIONAL)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="check-deposito"
                      checked={mostrarDeposito}
                      onChange={(e) => setMostrarDeposito(e.target.checked)}
                      className="h-4 w-4 text-[#3a6ea5] border-gray-400 rounded focus:ring-[#3a6ea5]"
                    />
                    <label htmlFor="check-deposito" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Agregar Depósito
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="check-caja-chica"
                      checked={mostrarCajaChica}
                      onChange={(e) => setMostrarCajaChica(e.target.checked)}
                      className="h-4 w-4 text-[#3a6ea5] border-gray-400 rounded focus:ring-[#3a6ea5]"
                    />
                    <label htmlFor="check-caja-chica" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Agregar Caja Chica
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="check-saldo-anterior"
                      checked={mostrarSaldoAnterior}
                      onChange={(e) => setMostrarSaldoAnterior(e.target.checked)}
                      className="h-4 w-4 text-[#3a6ea5] border-gray-400 rounded focus:ring-[#3a6ea5]"
                    />
                    <label htmlFor="check-saldo-anterior" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Agregar Saldo Anterior
                    </label>
                  </div>
                </div>

                {/* Campos dinámicos */}
                <div className="space-y-4">
                  {mostrarDeposito && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded-lg border border-gray-300">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                          Fecha de Depósito
                        </label>
                        <input
                          type="date"
                          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                          value={fechaDeposito}
                          onChange={(e) => setFechaDeposito(e.target.value)}
                          max={endDate || undefined}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                          Monto del Depósito
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                          value={montoDeposito}
                          onChange={(e) => setMontoDeposito(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {mostrarCajaChica && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded-lg border border-gray-300">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                          Fecha de Caja Chica
                        </label>
                        <input
                          type="date"
                          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                          value={fechaCajaChica}
                          onChange={(e) => setFechaCajaChica(e.target.value)}
                          max={endDate || undefined}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                          Monto en Caja Chica
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                          value={montoCajaChica}
                          onChange={(e) => setMontoCajaChica(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {mostrarSaldoAnterior && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded-lg border border-gray-300">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                          Fecha del Saldo Anterior
                        </label>
                        <input
                          type="date"
                          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                          value={fechaSaldoAnterior}
                          onChange={(e) => setFechaSaldoAnterior(e.target.value)}
                          max={endDate || undefined}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                          Monto del Saldo Anterior
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                          value={montoSaldoAnterior}
                          onChange={(e) => setMontoSaldoAnterior(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Botón de Generar */}
              <div className="flex justify-center pt-4">
                <button
                  onClick={handleDownload}
                  disabled={isLoading || isFormInvalid}
                  className={`px-6 py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center min-w-[280px] ${
                    isLoading || isFormInvalid
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-[#3a6ea5] text-white hover:bg-[#2d5592]'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      GENERANDO...
                    </>
                  ) : (
                    'BUSCAR GASTOS Y GENERAR EXCEL'
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      </main>

      <Footer />

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        
        body {
          padding-top: 0;
          padding-bottom: 0;
          margin: 0;
          overflow-x: hidden;
        }
        
        .fixed.inset-0.z-\\[9999\\] {
          z-index: 9999 !important;
        }
        
        header, footer {
          z-index: 50 !important;
        }
        
        body.modal-open {
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}