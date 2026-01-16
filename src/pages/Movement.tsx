import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Layout } from '../components/Layout';
import { ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle2, Package } from 'lucide-react';

interface Material {
  id: string;
  codigo_barras: string;
  nome: string;
  tipo: string;
  quantidade_atual: number;
  unidade_medida: string;
}

interface Transaction {
  id: string;
  type: string;
  quantidade: number;
  data_hora: string;
  material_nome: string;
  user_nome: string;
}

export function Movement() {
  const { token, user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [movementType, setMovementType] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA');
  const [quantidade, setQuantidade] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDebug, setShowDebug] = useState(false);

  const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb`;

  // Debug: log token changes
  useEffect(() => {
    console.log('🔑 Movement component - Token status:', token ? `EXISTS (${token.substring(0, 20)}...)` : 'NOT FOUND');
    console.log('👤 User:', user);
  }, [token, user]);

  useEffect(() => {
    fetchMaterials();
    fetchTransactions();
  }, []);

  const fetchMaterials = async () => {
    try {
      const response = await fetch(`${API_URL}/materials`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMaterials(data.materials);
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await fetch(`${API_URL}/transactions?limit=20`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    console.log('=== STARTING TRANSACTION ===');

    if (!selectedMaterialId || !quantidade) {
      setError('Selecione um material e informe a quantidade');
      return;
    }

    const qtd = parseFloat(quantidade);
    if (qtd <= 0) {
      setError('A quantidade deve ser maior que zero');
      return;
    }

    if (!token) {
      console.error('❌ NO TOKEN FOUND');
      setError('Você precisa estar autenticado. Faça login novamente.');
      return;
    }

    console.log('✅ Token exists:', token.substring(0, 20) + '...');
    console.log('✅ Movement type:', movementType);
    console.log('✅ Material ID:', selectedMaterialId);
    console.log('✅ Quantity:', qtd);

    setIsLoading(true);

    try {
      const requestBody = {
        material_id: selectedMaterialId,
        type: movementType,
        quantidade: qtd
      };

      console.log('📤 Request body:', requestBody);
      console.log('📤 Request URL:', `${API_URL}/transactions`);
      console.log('📤 Using publicAnonKey for Authorization');
      console.log('📤 Sending access_token in X-Access-Token header');

      const response = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Access-Token': token
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📥 Response status:', response.status);
      console.log('📥 Response ok:', response.ok);

      // Get response text first to see what we receive
      const responseText = await response.text();
      console.log('📥 Response text:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        throw new Error(`Resposta inválida do servidor: ${responseText.substring(0, 100)}`);
      }

      console.log('📥 Response data:', data);

      if (!response.ok) {
        console.error('❌ Server error:', data.error);
        throw new Error(data.error || 'Erro ao registrar movimentação');
      }

      console.log('✅ Transaction successful!');
      setSuccess(`${movementType === 'ENTRADA' ? 'Entrada' : 'Saída'} registrada com sucesso!`);
      setSelectedMaterialId('');
      setQuantidade('');
      await fetchMaterials();
      await fetchTransactions();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('❌ Transaction error:', err);
      console.error('❌ Error message:', err.message);
      console.error('❌ Error stack:', err.stack);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Movimentação</h2>
          <p className="text-gray-600">Registre entradas e saídas de materiais</p>
          
          {/* Debug Info */}
          {!token && (
            <div className="mt-4 bg-yellow-50 border-2 border-yellow-400 text-yellow-800 px-4 py-3 rounded-lg">
              <strong>⚠️ ATENÇÃO:</strong> Você não está autenticado! Faça login novamente.
            </div>
          )}
          
          {token && user && (
            <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm">
              ✅ Autenticado como: <strong>{user.nome || user.email}</strong>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Movement Form */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Registrar Movimentação</h3>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start">
                <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-sm">{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Tipo de Movimentação
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMovementType('ENTRADA')}
                    className={`p-4 border-2 rounded-xl font-semibold transition-all ${
                      movementType === 'ENTRADA'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <ArrowUpCircle className="w-6 h-6 mx-auto mb-2" />
                    ENTRADA
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('SAIDA')}
                    className={`p-4 border-2 rounded-xl font-semibold transition-all ${
                      movementType === 'SAIDA'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <ArrowDownCircle className="w-6 h-6 mx-auto mb-2" />
                    SAÍDA
                  </button>
                </div>
              </div>

              {/* Material Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Material *
                </label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                >
                  <option value="">Selecione um material...</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.codigo_barras} - {material.nome} ({material.quantidade_atual} {material.unidade_medida})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Material Info */}
              {selectedMaterial && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-900 mb-2">Material Selecionado:</p>
                  <p className="text-sm text-blue-800">
                    <strong>Nome:</strong> {selectedMaterial.nome}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>Tipo:</strong> {selectedMaterial.tipo}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>Estoque Atual:</strong>{' '}
                    <span className="font-bold">
                      {selectedMaterial.quantidade_atual} {selectedMaterial.unidade_medida}
                    </span>
                  </p>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantidade *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-lg font-semibold"
                  placeholder="0.00"
                  required
                />
                {selectedMaterial && (
                  <p className="mt-2 text-sm text-gray-600">
                    Unidade: {selectedMaterial.unidade_medida}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-4 rounded-xl font-bold text-white text-lg shadow-lg transition-all ${
                  movementType === 'ENTRADA'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading
                  ? 'Processando...'
                  : `Registrar ${movementType === 'ENTRADA' ? 'Entrada' : 'Saída'}`}
              </button>
            </form>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Movimentações Recentes</h3>

            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhuma movimentação registrada</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className={`p-4 rounded-lg border-l-4 ${
                      transaction.type === 'ENTRADA'
                        ? 'bg-green-50 border-green-500'
                        : 'bg-red-50 border-red-500'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          {transaction.type === 'ENTRADA' ? (
                            <ArrowUpCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <ArrowDownCircle className="w-5 h-5 text-red-600" />
                          )}
                          <span
                            className={`font-bold text-sm ${
                              transaction.type === 'ENTRADA' ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
                            {transaction.type}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-900">{transaction.material_nome}</p>
                        <p className="text-sm text-gray-600">
                          Quantidade: <strong>{transaction.quantidade}</strong>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {transaction.user_nome} • {formatDate(transaction.data_hora)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}