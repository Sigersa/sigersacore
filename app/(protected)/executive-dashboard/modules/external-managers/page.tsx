'use client';
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from '@/components/header/4/4.1';
import Footer from '@/components/footer';
import { useSessionManager } from '@/hooks/useSessionManager/4';
import { useInactivityManager } from '@/hooks/useInactivityManager';
import { X, CheckCircle, AlertCircle, Search, Plus, Edit, Trash2, UserCog } from 'lucide-react';

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

interface Client {
  ClientID: number;
  ClientName: string;
  BusinessName: string;
}

interface ExternalProjectManager {
  ExternalProjectManagerID: number;
  NameProjectManager: string;
  ClientID: number;
  ClientName?: string;
  Email: string | null;
  Phone: string | null;
}

// ============ FUNCIÓN PARA CONVERTIR A MAYÚSCULAS ============

const toUpperCaseWithAccents = (text: string): string => {
  return text.toUpperCase();
};

// ============ MODAL GENÉRICO ============

const Modal = ({ isOpen, onClose, title, message, type = 'info' }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}) => {
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

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-3">
              {getIcon()}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">{title}</h3>
              <p className="text-sm text-gray-600 mt-1 leading-5">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="p-6 pt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors"
          >
            ACEPTAR
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ MODAL DE ELIMINACIÓN ============

const DeleteModal = ({ isOpen, onClose, onConfirm, manager }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  manager: ExternalProjectManager | null;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !manager) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in relative z-[10000]">
        <div className="p-6 pb-4 border-b border-gray-300">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Confirmar eliminación</h3>
              <p className="text-sm text-gray-600 mt-1 leading-5">
                ¿Estás seguro que deseas eliminar al Project Manager <span className="font-bold">{manager.NameProjectManager}</span>?
              </p>
              <p className="text-sm text-gray-500 mt-2 leading-5">Esta acción no se puede deshacer.</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="p-6 pt-4 flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-6 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors"
          >
            CANCELAR
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center min-w-[100px]"
          >
            {isDeleting ? (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
            ) : (
              'ELIMINAR'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ MODAL DE EDICIÓN ============

const EditModal = ({ isOpen, onClose, manager, clients, onSave }: {
  isOpen: boolean;
  onClose: () => void;
  manager: ExternalProjectManager | null;
  clients: Client[];
  onSave: (data: ExternalProjectManager) => void;
}) => {
  const [editData, setEditData] = useState<ExternalProjectManager | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info'
  });

  const closeModal = () => {
    setModal({
      isOpen: false,
      title: '',
      message: '',
      type: 'info'
    });
  };

  useEffect(() => {
    if (manager) {
      setEditData(manager);
    }
  }, [manager]);

  const handleClose = () => {
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!editData) return;
    
    const { name, value } = e.target;
    
    if (name === 'NameProjectManager') {
      setEditData({
        ...editData,
        [name]: toUpperCaseWithAccents(value)
      });
    } else if (name === 'ClientID') {
      setEditData({
        ...editData,
        [name]: parseInt(value) || 0
      });
    } else if (name === 'Email') {
      setEditData({
        ...editData,
        [name]: value.toLowerCase()
      });
    } else {
      setEditData({
        ...editData,
        [name]: value
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;

    if (!editData.NameProjectManager.trim()) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'El nombre del Project Manager es requerido',
        type: 'error'
      });
      return;
    }

    if (!editData.ClientID) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'El cliente es requerido',
        type: 'error'
      });
      return;
    }

    setIsSaving(true);
    try {
      const dataToSend: ExternalProjectManager = {
        ...editData,
        NameProjectManager: toUpperCaseWithAccents(editData.NameProjectManager.trim()),
        Email: editData.Email ? editData.Email.trim().toLowerCase() : null,
        Phone: editData.Phone ? editData.Phone.trim() : null
      };
      await onSave(dataToSend);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !editData) return null;

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full animate-fade-in relative z-[10000] max-h-[90vh] overflow-y-auto">
          <div className="p-6 pb-4 border-b border-gray-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">EDITAR PROJECT MANAGER</h3>
                <p className="text-sm text-gray-600 mt-1">Modifica los datos del Project Manager Externo</p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="edit-NameProjectManager" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Nombre del Project Manager *
                </label>
                <input
                  type="text"
                  id="edit-NameProjectManager"
                  name="NameProjectManager"
                  value={editData.NameProjectManager}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  placeholder="Ingrese el nombre del Project Manager"
                  required
                />
              </div>

              <div>
                <label htmlFor="edit-ClientID" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Cliente *
                </label>
                <select
                  id="edit-ClientID"
                  name="ClientID"
                  value={editData.ClientID || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium appearance-none"
                  required
                >
                  <option value="">Seleccione un cliente</option>
                  {clients.map((client) => (
                    <option key={client.ClientID} value={client.ClientID}>
                      {client.ClientName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-Email" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  id="edit-Email"
                  name="Email"
                  value={editData.Email || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <div>
                <label htmlFor="edit-Phone" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Teléfono
                </label>
                <input
                  type="tel"
                  id="edit-Phone"
                  name="Phone"
                  value={editData.Phone || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  placeholder="Ingrese el teléfono"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-300">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors"
              >
                CANCELAR
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center min-w-[120px]"
              >
                {isSaving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                  'GUARDAR CAMBIOS'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Modal 
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </>
  );
};

// ============ MODAL PARA AGREGAR ============

const AddManagerModal = ({ isOpen, onClose, onSave, clients, isSubmitting }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ExternalProjectManager) => void;
  clients: Client[];
  isSubmitting: boolean;
}) => {
  const [managerData, setManagerData] = useState<ExternalProjectManager>({
    ExternalProjectManagerID: 0,
    NameProjectManager: '',
    ClientID: 0,
    Email: '',
    Phone: ''
  });

  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info'
  });

  const closeModal = () => {
    setModal({
      isOpen: false,
      title: '',
      message: '',
      type: 'info'
    });
  };

  const handleClose = () => {
    setManagerData({
      ExternalProjectManagerID: 0,
      NameProjectManager: '',
      ClientID: 0,
      Email: '',
      Phone: ''
    });
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'NameProjectManager') {
      setManagerData(prev => ({
        ...prev,
        [name]: toUpperCaseWithAccents(value)
      }));
    } else if (name === 'ClientID') {
      setManagerData(prev => ({
        ...prev,
        [name]: parseInt(value) || 0
      }));
    } else if (name === 'Email') {
      setManagerData(prev => ({
        ...prev,
        [name]: value.toLowerCase()
      }));
    } else {
      setManagerData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!managerData.NameProjectManager.trim()) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'El nombre del Project Manager es requerido',
        type: 'error'
      });
      return;
    }

    if (!managerData.ClientID) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: 'El cliente es requerido',
        type: 'error'
      });
      return;
    }

    const dataToSend: ExternalProjectManager = {
      ...managerData,
      NameProjectManager: toUpperCaseWithAccents(managerData.NameProjectManager.trim()),
      Email: managerData.Email ? managerData.Email.trim().toLowerCase() : null,
      Phone: managerData.Phone ? managerData.Phone.trim() : null
    };

    await onSave(dataToSend);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 bg-black/70">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full animate-fade-in relative z-[10000] max-h-[90vh] overflow-y-auto">
          <div className="p-6 pb-4 border-b border-gray-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">AGREGAR PROJECT MANAGER EXTERNO</h3>
                <p className="text-sm text-gray-600 mt-1">Complete la información del Project Manager</p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="NameProjectManager" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Nombre del Project Manager *
                </label>
                <input
                  type="text"
                  id="NameProjectManager"
                  name="NameProjectManager"
                  value={managerData.NameProjectManager}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  placeholder="Ingrese el nombre del Project Manager"
                  required
                />
              </div>

              <div>
                <label htmlFor="ClientID" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Cliente *
                </label>
                <select
                  id="ClientID"
                  name="ClientID"
                  value={managerData.ClientID || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium appearance-none"
                  required
                >
                  <option value="">Seleccione un cliente</option>
                  {clients.map((client) => (
                    <option key={client.ClientID} value={client.ClientID}>
                      {client.ClientName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="Email" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  id="Email"
                  name="Email"
                  value={managerData.Email || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <div>
                <label htmlFor="Phone" className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                  Teléfono
                </label>
                <input
                  type="tel"
                  id="Phone"
                  name="Phone"
                  value={managerData.Phone || ''}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                  placeholder="Ingrese el teléfono"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-300">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors"
              >
                CANCELAR
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center justify-center min-w-[120px]"
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                  'GUARDAR'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Modal 
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </>
  );
};

// ============ COMPONENTE PRINCIPAL ============

export default function ExternalManagersPage() {
  const { user, loading: sessionLoading } = useSessionManager();
  useInactivityManager();
  const router = useRouter();
  
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
  
  const [managers, setManagers] = useState<ExternalProjectManager[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info'
  });

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    manager: null as ExternalProjectManager | null
  });

  const [editModal, setEditModal] = useState({
    isOpen: false,
    manager: null as ExternalProjectManager | null
  });

  const [addModal, setAddModal] = useState({
    isOpen: false
  });

  const showModal = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModal({
      isOpen: true,
      title,
      message,
      type
    });
  };

  const closeModal = () => {
    setModal({
      isOpen: false,
      title: '',
      message: '',
      type: 'info'
    });
  };

  const openDeleteModal = (manager: ExternalProjectManager) => {
    setDeleteModal({
      isOpen: true,
      manager
    });
  };

  const closeDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      manager: null
    });
  };

  const openEditModal = (manager: ExternalProjectManager) => {
    setEditModal({
      isOpen: true,
      manager
    });
  };

  const closeEditModal = () => {
    setEditModal({
      isOpen: false,
      manager: null
    });
  };

  const openAddModal = () => {
    setAddModal({
      isOpen: true
    });
  };

  const closeAddModal = () => {
    setAddModal({
      isOpen: false
    });
  };

  const fetchUserData = async () => {
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
      console.error('Error al obtener datos de usuario:', error);
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchManagers = useCallback(async () => {
    try {
      setTableLoading(true);
      
      const response = await fetch('/api/executive-manager/external-managers');
      if (response.ok) {
        const data = await response.json();
        setManagers(Array.isArray(data) ? data : []);
      } else {
        showModal('Error', 'Error al obtener Project Managers', 'error');
      }
    } catch (error) {
      console.error('Error al obtener Project Managers:', error);
      showModal('Error', 'Error al obtener Project Managers', 'error');
    } finally {
      setTableLoading(false);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const response = await fetch('/api/executive-manager/clients');
      if (response.ok) {
        const data = await response.json();
        const normalizedClients = Array.isArray(data) ? data.map((client: any) => ({
          ClientID: client.clientId || client.ClientID || client.id,
          ClientName: client.clientName || client.ClientName || client.name || 'Cliente sin nombre',
          BusinessName: client.businessName || client.BusinessName || ''
        })) : [];
        setClients(normalizedClients);
      }
    } catch (error) {
      console.error('Error al obtener clientes:', error);
    }
  }, []);

  const handleAdd = async (managerData: ExternalProjectManager) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/executive-manager/external-managers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(managerData)
      });

      if (response.ok) {
        await fetchManagers();
        showModal('Éxito', 'Project Manager guardado exitosamente.', 'success');
      } else {
        const errorData = await response.json();
        showModal('Error', `Error al guardar: ${errorData.message}`, 'error');
      }
    } catch (error) {
      console.error('Error al enviar los datos:', error);
      showModal('Error', 'Error al conectar con el servidor', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.manager) return;
    
    try {
      const response = await fetch(`/api/executive-manager/external-managers?id=${deleteModal.manager.ExternalProjectManagerID}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchManagers();
        showModal('Éxito', 'Project Manager eliminado exitosamente.', 'success');
      } else {
        const errorData = await response.json();
        showModal('Error', `Error al eliminar: ${errorData.message}`, 'error');
      }
    } catch (error) {
      console.error('Error al eliminar Project Manager:', error);
      showModal('Error', 'Error al conectar con el servidor', 'error');
    } finally {
      closeDeleteModal();
    }
  };

  const handleUpdate = async (data: ExternalProjectManager) => {
    try {
      const response = await fetch(`/api/executive-manager/external-managers?id=${data.ExternalProjectManagerID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        await fetchManagers();
        showModal('Éxito', 'Project Manager actualizado exitosamente.', 'success');
      } else {
        const errorData = await response.json();
        showModal('Error', `Error al actualizar: ${errorData.message}`, 'error');
      }
    } catch (error) {
      console.error('Error al actualizar Project Manager:', error);
      showModal('Error', 'Error al conectar con el servidor', 'error');
    } finally {
      closeEditModal();
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchUserData();
      await Promise.all([
        fetchManagers(),
        fetchClients()
      ]);
    };
    loadData();
  }, [fetchManagers, fetchClients]);

  const filteredManagers = managers.filter(manager =>
    manager.NameProjectManager.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (manager.Email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (manager.ClientName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3a6ea5] mx-auto"></div>
          <p className="mt-4 text-gray-700 font-medium">Cargando Project Managers...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <AppHeader title="PANEL DE CONTROL EJECUTIVO" />

      <main className="pt-[72px] pb-[80px] min-h-screen bg-gray-100">
        <div className="w-full px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-7xl mx-auto">
          
          {/* Header del Panel */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="bg-[#3a6ea5] p-4 rounded-lg shadow border border-[#3a6ea5] w-full">
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center">
                  GESTIÓN DE PROJECT MANAGERS EXTERNOS
                </h1>
                <p className="text-sm text-gray-200 mt-1">
                  Administra y visualiza todos los Project Managers externos registrados.
                </p>
              </div>
            </div>

            {/* Panel de Managers */}
            <div className="bg-white rounded-lg shadow border border-gray-300 overflow-hidden">
              
              {/* Header con Búsqueda y Botón */}
              <div className="p-6 border-b border-gray-300 bg-gray-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-72">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-gray-400 rounded focus:outline-none focus:border-[#3a6ea5] font-medium"
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={openAddModal}
                    className="px-6 py-2.5 bg-[#3a6ea5] text-white font-bold rounded-lg hover:bg-[#2d5592] transition-colors flex items-center whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    AGREGAR PROJECT MANAGER
                  </button>
                </div>
              </div>

              {/* Tabla de Managers */}
              <div className="overflow-x-auto">
                {tableLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3a6ea5]"></div>
                      <p className="text-sm text-gray-600 font-medium">Cargando Project Managers...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {filteredManagers.length > 0 ? (
                      <div className="overflow-hidden">
                        <table className="w-full bg-white text-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 border-r border-gray-300">
                                Nombre
                              </th>
                              <th className="px-4 py-3 text-left font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 border-r border-gray-300">
                                Cliente
                              </th>
                              <th className="px-4 py-3 text-left font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 border-r border-gray-300">
                                Email
                              </th>
                              <th className="px-4 py-3 text-left font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300 border-r border-gray-300">
                                Teléfono
                              </th>
                              <th className="px-4 py-3 text-center font-bold text-gray-700 uppercase tracking-wider border-b border-gray-300">
                                Acciones
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {filteredManagers.map((manager, index) => (
                              <tr 
                                key={`manager-${manager.ExternalProjectManagerID}`}
                                className={`transition-colors duration-150 ${
                                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                } hover:bg-gray-100`}
                              >
                                <td className="px-4 py-3 border-r border-gray-300 text-gray-700 font-medium">
                                  {manager.NameProjectManager}
                                </td>
                                <td className="px-4 py-3 border-r border-gray-300 text-gray-700">
                                  {manager.ClientName || 'Sin cliente'}
                                </td>
                                <td className="px-4 py-3 border-r border-gray-300 text-gray-700">
                                  {manager.Email || '-'}
                                </td>
                                <td className="px-4 py-3 border-r border-gray-300 text-gray-700">
                                  {manager.Phone || '-'}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  <div className="flex justify-center space-x-2">
                                    <button
                                      onClick={() => openEditModal(manager)}
                                      className="inline-flex items-center px-4 py-2 border border-[#3a6ea5] text-[#3a6ea5] font-bold rounded-lg hover:bg-[#3a6ea5] hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#3a6ea5] focus:ring-offset-1 text-xs"
                                    >
                                      <Edit className="w-3.5 h-3.5 mr-1.5" />
                                      EDITAR
                                    </button>
                                    <button
                                      onClick={() => openDeleteModal(manager)}
                                      className="inline-flex items-center px-4 py-2 border border-red-600 text-red-600 font-bold rounded-lg hover:bg-red-600 hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 text-xs"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                      ELIMINAR
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <div className="bg-gray-100 rounded-full p-4 mb-4">
                            <UserCog className="h-8 w-8 text-gray-400" />
                          </div>
                          <h3 className="text-sm font-bold text-gray-900">No hay Project Managers</h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {searchTerm ? 'No se encontraron Project Managers que coincidan con tu búsqueda.' : 'No se han encontrado Project Managers registrados.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Modales */}
      <Modal 
        isOpen={modal.isOpen}
        onClose={closeModal}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />

      <DeleteModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        manager={deleteModal.manager}
      />

      <EditModal
        isOpen={editModal.isOpen}
        onClose={closeEditModal}
        manager={editModal.manager}
        clients={clients}
        onSave={handleUpdate}
      />

      <AddManagerModal
        isOpen={addModal.isOpen}
        onClose={closeAddModal}
        onSave={handleAdd}
        clients={clients}
        isSubmitting={isSubmitting}
      />

      {/* Estilos globales */}
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