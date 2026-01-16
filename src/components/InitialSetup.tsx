import { useState } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Database, Loader2, RefreshCw } from 'lucide-react';

export function InitialSetup() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [message, setMessage] = useState('');
  const [seedComplete, setSeedComplete] = useState(false);

  const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb`;

  const handleSeed = async () => {
    setIsSeeding(true);
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/seed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ ${data.message}`);
        setSeedComplete(true);
      } else {
        setMessage(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      setMessage('❌ Erro ao popular banco de dados');
      console.error('Seed error:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start space-x-3">
        <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-semibold text-blue-900 mb-1">Primeira vez usando o sistema?</h4>
          <p className="text-sm text-blue-800 mb-3">
            Popule o banco de dados com 50 materiais de exemplo para começar a testar.
          </p>
          <div className="flex space-x-2">
            <button
              onClick={handleSeed}
              disabled={isSeeding || seedComplete}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSeeding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Populando...
                </>
              ) : (
                'Popular Banco de Dados'
              )}
            </button>
            {seedComplete && (
              <button
                onClick={handleReload}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Recarregar Página
              </button>
            )}
          </div>
          {message && (
            <p className="mt-2 text-sm font-medium text-blue-900">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}