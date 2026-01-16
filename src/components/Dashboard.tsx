import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Package, AlertTriangle, TrendingUp, Box, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { toast } from 'sonner@2.0.3';
import { Button } from './ui/button';

interface DashboardProps {
  token: string;
}

interface Stats {
  totalMateriais: number;
  baixoEstoque: number;
  movimentacoesHoje: number;
  estoqueTotal: number;
}

export function Dashboard({ token }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const fetchStats = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/stats`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Access-Token': token,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao carregar estatísticas');
      }

      const data = await response.json();
      setStats(data);
    } catch (error: any) {
      console.error('Error fetching stats:', error);
      toast.error('Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/seed`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao popular banco de dados');
      }

      const data = await response.json();
      toast.success(`${data.materiaisCriados} materiais criados com sucesso!`);
      
      // Refresh stats
      await fetchStats();
    } catch (error: any) {
      console.error('Erro no seed:', error);
      toast.error(error.message);
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total de Materiais',
      value: stats?.totalMateriais || 0,
      icon: Package,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
    },
    {
      title: 'Baixo Estoque',
      value: stats?.baixoEstoque || 0,
      icon: AlertTriangle,
      color: 'bg-red-500',
      textColor: 'text-red-600',
    },
    {
      title: 'Movimentações Hoje',
      value: stats?.movimentacoesHoje || 0,
      icon: TrendingUp,
      color: 'bg-green-500',
      textColor: 'text-green-600',
    },
    {
      title: 'Estoque Total (kg)',
      value: stats?.estoqueTotal?.toFixed(1) || 0,
      icon: Box,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-slate-600 mt-1">
            Visão geral do estoque de materiais
          </p>
        </div>

        {stats?.totalMateriais === 0 && (
          <Button
            onClick={handleSeed}
            disabled={seeding}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {seeding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Populando...
              </>
            ) : (
              <>
                🌱 Popular Banco de Dados (50 materiais)
              </>
            )}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">
                  {stat.title}
                </CardTitle>
                <div className={`${stat.color} p-2 rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${stat.textColor}`}>
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Sobre o Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              <strong>SobraCorte</strong> é o sistema de gerenciamento de materiais
              excedentes do Pavilhão do Corte Automático.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Controle completo de estoque de sobras</li>
              <li>Registro de entradas e saídas</li>
              <li>Rastreamento por código de barras</li>
              <li>Alertas de baixo estoque</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Navegação Rápida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-1">
                📦 Materiais
              </p>
              <p className="text-xs text-slate-600">
                Consulte, adicione ou edite materiais em estoque
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-1">
                🔄 Movimentações
              </p>
              <p className="text-xs text-slate-600">
                Registre entradas e saídas de materiais
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}