import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { 
  User, 
  Shield, 
  Users, 
  AlertCircle, 
  CheckCircle, 
  Crown,
  UserCog 
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface UserData {
  id: string;
  nome: string;
  email: string;
  role: string;
  created_at?: string;
}

export function Profile() {
  const { user, token } = useAuth();
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb`;

  const isAdmin = user?.role === 'admin';

  // Load all users if admin
  useEffect(() => {
    if (isAdmin) {
      loadAllUsers();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const loadAllUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Access-Token': token || ''
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao carregar usuários');
      }

      const data = await response.json();
      setAllUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!confirm(`Tem certeza que deseja alterar este usuário para ${newRole}?`)) {
      return;
    }

    try {
      setUpdatingUserId(userId);
      
      const response = await fetch(`${API_URL}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Access-Token': token || ''
        },
        body: JSON.stringify({ role: newRole })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar permissão');
      }

      toast.success('Permissão atualizada com sucesso!');
      await loadAllUsers(); // Reload users list
    } catch (error) {
      console.error('Error updating user role:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar permissão');
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Perfil do Usuário</h1>
            <p className="text-gray-600 mt-1">Gerencie seu perfil e permissões de usuários</p>
          </div>
        </div>

        {/* Current User Profile Card */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6">
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 backdrop-blur-sm p-4 rounded-full">
                <User className="w-12 h-12 text-white" />
              </div>
              <div className="text-white">
                <h2 className="text-2xl font-bold">{user?.nome}</h2>
                <p className="text-blue-100">{user?.email}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600 font-medium">Nível de Acesso</p>
                  <div className="flex items-center space-x-2 mt-1">
                    {user?.role === 'admin' ? (
                      <>
                        <Crown className="w-4 h-4 text-yellow-500" />
                        <span className="text-lg font-semibold text-yellow-600 capitalize">
                          Administrador
                        </span>
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="text-lg font-semibold text-gray-700 capitalize">
                          Operador
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600 font-medium">Status da Conta</p>
                  <p className="text-lg font-semibold text-green-600 mt-1">Ativa</p>
                </div>
              </div>
            </div>

            {user?.role === 'admin' && (
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <Crown className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-yellow-900">Privilégios de Administrador</h3>
                    <ul className="mt-2 text-sm text-yellow-800 space-y-1">
                      <li>• Gerenciar todos os materiais e movimentações</li>
                      <li>• Promover ou rebaixar usuários</li>
                      <li>• Visualizar e modificar todos os dados do sistema</li>
                      <li>• Acesso total a relatórios e estatísticas</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Admin Panel - User Management */}
        {isAdmin && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-gray-800 p-4 flex items-center space-x-3">
              <Users className="w-6 h-6 text-white" />
              <h2 className="text-xl font-bold text-white">Gerenciamento de Usuários</h2>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 mt-2">Carregando usuários...</p>
                </div>
              ) : allUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">Nenhum usuário encontrado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Usuário</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Nível Atual</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((userData) => (
                        <tr 
                          key={userData.id} 
                          className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                            userData.id === user?.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <td className="py-4 px-4">
                            <div className="flex items-center space-x-3">
                              <div className={`p-2 rounded-full ${
                                userData.role === 'admin' 
                                  ? 'bg-yellow-100' 
                                  : 'bg-gray-100'
                              }`}>
                                {userData.role === 'admin' ? (
                                  <Crown className="w-4 h-4 text-yellow-600" />
                                ) : (
                                  <User className="w-4 h-4 text-gray-600" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{userData.nome}</p>
                                {userData.id === user?.id && (
                                  <span className="text-xs text-blue-600 font-medium">
                                    (Você)
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-gray-700">{userData.email}</td>
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                              userData.role === 'admin'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {userData.role === 'admin' ? 'Administrador' : 'Operador'}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center space-x-2">
                              {userData.id === user?.id ? (
                                <span className="text-sm text-gray-500 italic">
                                  Seu próprio perfil
                                </span>
                              ) : (
                                <>
                                  {userData.role !== 'admin' && (
                                    <button
                                      onClick={() => updateUserRole(userData.id, 'admin')}
                                      disabled={updatingUserId === userData.id}
                                      className="flex items-center space-x-1 px-3 py-1.5 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                    >
                                      <Crown className="w-4 h-4" />
                                      <span>
                                        {updatingUserId === userData.id ? 'Atualizando...' : 'Promover Admin'}
                                      </span>
                                    </button>
                                  )}
                                  {userData.role === 'admin' && (
                                    <button
                                      onClick={() => updateUserRole(userData.id, 'operador')}
                                      disabled={updatingUserId === userData.id}
                                      className="flex items-center space-x-1 px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                    >
                                      <UserCog className="w-4 h-4" />
                                      <span>
                                        {updatingUserId === userData.id ? 'Atualizando...' : 'Rebaixar Operador'}
                                      </span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-900">
                    <p className="font-semibold mb-1">Informações sobre Níveis de Acesso:</p>
                    <ul className="space-y-1 ml-4">
                      <li><strong>Operador:</strong> Acesso básico ao sistema - pode visualizar materiais e registrar movimentações</li>
                      <li><strong>Administrador:</strong> Acesso completo - pode gerenciar materiais, usuários e todas as permissões</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info for non-admin users */}
        {!isAdmin && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Sobre Permissões</h3>
                <p className="text-gray-700 mb-3">
                  Você está usando o sistema como <strong>Operador</strong>. Este nível permite:
                </p>
                <ul className="space-y-1 text-gray-700 ml-4">
                  <li>✓ Visualizar materiais cadastrados</li>
                  <li>✓ Registrar entradas e saídas</li>
                  <li>✓ Consultar dashboard e estatísticas</li>
                </ul>
                <p className="text-gray-600 mt-4 text-sm">
                  Para solicitar permissões de administrador, entre em contato com um administrador do sistema.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
