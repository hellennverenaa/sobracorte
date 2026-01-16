import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, ArrowDown, ArrowUp, Loader2, TrendingUp } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { toast } from 'sonner@2.0.3';

interface TransactionsProps {
  token: string;
  user: any;
}

interface Transaction {
  id: string;
  type: 'ENTRADA' | 'SAIDA';
  quantidade: number;
  data_hora: string;
  material_id: string;
  user_id: string | null;
  material_nome: string;
  material_codigo: string;
}

interface Material {
  id: string;
  codigo_barras: string;
  nome: string;
  quantidade_atual: number;
  unidade_medida: string;
}

export function Transactions({ token, user }: TransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [transactionType, setTransactionType] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA');
  const [quantidade, setQuantidade] = useState('');

  const fetchTransactions = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/transactions`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Access-Token': token,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao carregar movimentações');
      }

      const data = await response.json();
      setTransactions(data.transactions);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      toast.error('Erro ao carregar movimentações');
    }
  };

  const fetchMaterials = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Access-Token': token,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao carregar materiais');
      }

      const data = await response.json();
      setMaterials(data.materials);
    } catch (error: any) {
      console.error('Error fetching materials:', error);
      toast.error('Erro ao carregar materiais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchMaterials();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMaterialId || !quantidade) {
      toast.error('Selecione um material e informe a quantidade');
      return;
    }

    const qtd = parseFloat(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error('Quantidade inválida');
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
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Access-Token': token,
          },
          body: JSON.stringify({
            material_id: selectedMaterialId,
            type: transactionType,
            quantidade: qtd,
            user_id: user.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar movimentação');
      }

      toast.success('Movimentação registrada com sucesso!');
      setDialogOpen(false);
      resetForm();
      fetchTransactions();
      fetchMaterials(); // Refresh materials to show updated quantities
    } catch (error: any) {
      console.error('Erro ao registrar movimentação:', error);
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedMaterialId('');
    setTransactionType('ENTRADA');
    setQuantidade('');
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
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
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Movimentações</h2>
          <p className="text-slate-600 mt-1">
            Registre entradas e saídas de materiais
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4 mr-2" />
              Nova Movimentação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Registrar Movimentação</DialogTitle>
              <DialogDescription>
                Registre uma entrada ou saída de material do estoque
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Transaction Type - Large Buttons */}
              <div className="space-y-2">
                <Label>Tipo de Movimentação</Label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setTransactionType('ENTRADA')}
                    disabled={submitting}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      transactionType === 'ENTRADA'
                        ? 'border-green-500 bg-green-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <ArrowDown className={`w-8 h-8 mx-auto mb-2 ${
                      transactionType === 'ENTRADA' ? 'text-green-600' : 'text-slate-400'
                    }`} />
                    <p className={`font-bold text-lg ${
                      transactionType === 'ENTRADA' ? 'text-green-700' : 'text-slate-600'
                    }`}>
                      ENTRADA
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Material retornando
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransactionType('SAIDA')}
                    disabled={submitting}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      transactionType === 'SAIDA'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <ArrowUp className={`w-8 h-8 mx-auto mb-2 ${
                      transactionType === 'SAIDA' ? 'text-blue-600' : 'text-slate-400'
                    }`} />
                    <p className={`font-bold text-lg ${
                      transactionType === 'SAIDA' ? 'text-blue-700' : 'text-slate-600'
                    }`}>
                      SAÍDA
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Reuso/Consumo
                    </p>
                  </button>
                </div>
              </div>

              {/* Material Selection */}
              <div className="space-y-2">
                <Label htmlFor="material">Material *</Label>
                <Select
                  value={selectedMaterialId}
                  onValueChange={setSelectedMaterialId}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.codigo_barras} - {material.nome} ({material.quantidade_atual} {material.unidade_medida})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedMaterial && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-700">
                      <strong>Estoque atual:</strong> {selectedMaterial.quantidade_atual} {selectedMaterial.unidade_medida}
                    </p>
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="quantidade">Quantidade *</Label>
                <div className="flex space-x-2">
                  <Input
                    id="quantidade"
                    type="number"
                    step="0.01"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    placeholder="0.00"
                    disabled={submitting}
                    className="text-lg h-12"
                  />
                  {selectedMaterial && (
                    <div className="flex items-center px-4 bg-slate-100 rounded-lg border border-slate-200">
                      <span className="text-sm text-slate-600 font-medium">
                        {selectedMaterial.unidade_medida}
                      </span>
                    </div>
                  )}
                </div>

                {selectedMaterial && quantidade && (
                  <div className={`mt-2 p-3 rounded-lg border ${
                    transactionType === 'ENTRADA'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <p className="text-sm font-medium">
                      {transactionType === 'ENTRADA' ? '📥 Novo estoque:' : '📤 Estoque após saída:'}
                      {' '}
                      <span className={transactionType === 'ENTRADA' ? 'text-green-700' : 'text-blue-700'}>
                        {transactionType === 'ENTRADA'
                          ? (selectedMaterial.quantidade_atual + parseFloat(quantidade || '0')).toFixed(2)
                          : (selectedMaterial.quantidade_atual - parseFloat(quantidade || '0')).toFixed(2)
                        } {selectedMaterial.unidade_medida}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className={
                    transactionType === 'ENTRADA'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    <>
                      {transactionType === 'ENTRADA' ? (
                        <ArrowDown className="w-4 h-4 mr-2" />
                      ) : (
                        <ArrowUp className="w-4 h-4 mr-2" />
                      )}
                      Confirmar {transactionType}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {transactions.length} {transactions.length === 1 ? 'Movimentação' : 'Movimentações'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="text-sm">
                        {formatDate(transaction.data_hora)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={transaction.type === 'ENTRADA' ? 'default' : 'secondary'}
                          className={
                            transaction.type === 'ENTRADA'
                              ? 'bg-green-600'
                              : 'bg-blue-600'
                          }
                        >
                          {transaction.type === 'ENTRADA' ? (
                            <>
                              <ArrowDown className="w-3 h-3 mr-1" />
                              Entrada
                            </>
                          ) : (
                            <>
                              <ArrowUp className="w-3 h-3 mr-1" />
                              Saída
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {transaction.material_nome}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {transaction.material_codigo}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <span className={
                          transaction.type === 'ENTRADA' ? 'text-green-700' : 'text-blue-700'
                        }>
                          {transaction.type === 'ENTRADA' ? '+' : '-'}
                          {transaction.quantidade}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}