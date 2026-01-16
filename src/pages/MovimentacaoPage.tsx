import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner@2.0.3';
import { TrendingUp, TrendingDown, Package, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface Material {
  id: string;
  codigo_barras: string;
  nome: string;
  tipo: string;
  quantidade_atual: number;
  unidade_medida: string;
}

export function MovimentacaoPage() {
  const { accessToken, user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [type, setType] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA');
  const [quantidade, setQuantidade] = useState('');

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    if (selectedMaterialId) {
      const material = materials.find(m => m.id === selectedMaterialId);
      setSelectedMaterial(material || null);
    } else {
      setSelectedMaterial(null);
    }
  }, [selectedMaterialId, materials]);

  const loadMaterials = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );
      const data = await response.json();
      setMaterials(data.materials || []);
    } catch (error) {
      console.error('Error loading materials:', error);
      toast.error('Erro ao carregar materiais');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMaterialId || !quantidade) {
      toast.error('Selecione um material e informe a quantidade');
      return;
    }

    const qtd = Number(quantidade);
    if (qtd <= 0) {
      toast.error('A quantidade deve ser maior que zero');
      return;
    }

    if (type === 'SAIDA' && selectedMaterial && qtd > selectedMaterial.quantidade_atual) {
      toast.error('Quantidade solicitada maior que o estoque disponível');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/transactions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            material_id: selectedMaterialId,
            type,
            quantidade: qtd
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar movimentação');
      }

      toast.success(
        `${type === 'ENTRADA' ? 'Entrada' : 'Saída'} registrada com sucesso!`,
        {
          description: `${qtd} ${selectedMaterial?.unidade_medida} de ${selectedMaterial?.nome}`
        }
      );

      // Reset form
      setSelectedMaterialId('');
      setQuantidade('');
      setSelectedMaterial(null);

      // Reload materials to update quantities
      loadMaterials();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const calculateNewQuantity = () => {
    if (!selectedMaterial || !quantidade) return null;
    const qtd = Number(quantidade);
    if (type === 'ENTRADA') {
      return selectedMaterial.quantidade_atual + qtd;
    } else {
      return selectedMaterial.quantidade_atual - qtd;
    }
  };

  const newQuantity = calculateNewQuantity();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Movimentação de Materiais</h1>
        <p className="text-slate-400">Registre entradas e saídas de sobras do estoque</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Type Selection */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Tipo de Movimentação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={() => setType('ENTRADA')}
              className={`w-full p-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-3 ${
                type === 'ENTRADA'
                  ? 'bg-green-600 text-white shadow-lg shadow-green-500/20 scale-105'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <TrendingUp className="h-6 w-6" />
              <div className="text-left">
                <div className="text-lg">ENTRADA</div>
                <div className="text-sm opacity-80">Sobra retornando ao estoque</div>
              </div>
              {type === 'ENTRADA' && <CheckCircle className="h-5 w-5 ml-auto" />}
            </button>

            <button
              onClick={() => setType('SAIDA')}
              className={`w-full p-6 rounded-lg font-semibold transition-all flex items-center justify-center gap-3 ${
                type === 'SAIDA'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-500/20 scale-105'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <TrendingDown className="h-6 w-6" />
              <div className="text-left">
                <div className="text-lg">SAÍDA</div>
                <div className="text-sm opacity-80">Material sendo reutilizado</div>
              </div>
              {type === 'SAIDA' && <CheckCircle className="h-5 w-5 ml-auto" />}
            </button>
          </CardContent>
        </Card>

        {/* Movement Form */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Package className="h-5 w-5" />
              Dados da Movimentação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200">Material</Label>
                {loading ? (
                  <div className="p-3 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-400 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando materiais...
                  </div>
                ) : (
                  <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white h-12">
                      <SelectValue placeholder="Selecione um material" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 max-h-64">
                      {materials.map((material) => (
                        <SelectItem key={material.id} value={material.id} className="text-white">
                          <div className="flex items-center justify-between w-full gap-4">
                            <span className="font-medium">{material.nome}</span>
                            <Badge variant="outline" className="text-xs">
                              {material.quantidade_atual} {material.unidade_medida}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200">
                  Quantidade {selectedMaterial ? `(${selectedMaterial.unidade_medida})` : ''}
                </Label>
                <Input
                  type="number"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="bg-slate-900/50 border-slate-600 text-white h-12 text-lg"
                  placeholder="0"
                  min="0"
                  step="0.01"
                  disabled={!selectedMaterial || submitting}
                  required
                />
              </div>

              {selectedMaterial && quantidade && newQuantity !== null && (
                <div className={`p-4 rounded-lg border ${
                  newQuantity < 0
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-blue-500/10 border-blue-500/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm">Estoque Atual</p>
                      <p className="text-white text-lg font-semibold">
                        {selectedMaterial.quantidade_atual} {selectedMaterial.unidade_medida}
                      </p>
                    </div>
                    <div className="text-2xl text-slate-500">→</div>
                    <div>
                      <p className="text-slate-400 text-sm">Novo Estoque</p>
                      <p className={`text-lg font-semibold ${
                        newQuantity < 0 ? 'text-red-500' : 'text-green-500'
                      }`}>
                        {newQuantity} {selectedMaterial.unidade_medida}
                      </p>
                    </div>
                  </div>
                  {newQuantity < 0 && (
                    <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
                      <XCircle className="h-4 w-4" />
                      Quantidade insuficiente em estoque
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className={`w-full h-14 text-lg font-semibold ${
                  type === 'ENTRADA'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
                disabled={submitting || !selectedMaterial || !quantidade || (newQuantity !== null && newQuantity < 0)}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    {type === 'ENTRADA' ? (
                      <TrendingUp className="mr-2 h-5 w-5" />
                    ) : (
                      <TrendingDown className="mr-2 h-5 w-5" />
                    )}
                    Confirmar {type === 'ENTRADA' ? 'Entrada' : 'Saída'}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Selected Material Info */}
      {selectedMaterial && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Informações do Material Selecionado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-400 text-sm">Código</p>
                <p className="text-white font-mono">{selectedMaterial.codigo_barras}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Nome</p>
                <p className="text-white font-semibold">{selectedMaterial.nome}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Tipo</p>
                <Badge variant="outline" className="border-slate-600 text-slate-300">
                  {selectedMaterial.tipo}
                </Badge>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Estoque Disponível</p>
                <p className="text-white font-semibold">
                  {selectedMaterial.quantidade_atual} {selectedMaterial.unidade_medida}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
