import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, Search, Edit, Trash2, Loader2, Package } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { toast } from 'sonner@2.0.3';

interface MaterialsProps {
  token: string;
  user: any;
}

interface Material {
  id: string;
  codigo_barras: string;
  nome: string;
  tipo: string;
  cor: string | null;
  quantidade_atual: number;
  unidade_medida: string;
  localizacao_pavilhao: string | null;
  data_cadastro: string;
}

export function Materials({ token, user }: MaterialsProps) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    nome: '',
    tipo: 'Tecido',
    cor: '',
    quantidade_atual: '',
    unidade_medida: 'kg',
    localizacao_pavilhao: '',
    codigo_barras: '',
  });

  const fetchMaterials = async () => {
    try {
      const params = new URLSearchParams();
      if (filterTipo !== 'todos') params.append('tipo', filterTipo);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials?${params}`,
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
    fetchMaterials();
  }, [filterTipo, searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome || !formData.tipo) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setSubmitting(true);

    try {
      const url = editingMaterial
        ? `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials/${editingMaterial.id}`
        : `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials`;

      const response = await fetch(url, {
        method: editingMaterial ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
          'X-Access-Token': token,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao salvar material');
      }

      toast.success(editingMaterial ? 'Material atualizado!' : 'Material criado!');
      setDialogOpen(false);
      resetForm();
      fetchMaterials();
    } catch (error: any) {
      console.error('Erro ao salvar material:', error);
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (material: Material) => {
    setEditingMaterial(material);
    setFormData({
      nome: material.nome,
      tipo: material.tipo,
      cor: material.cor || '',
      quantidade_atual: material.quantidade_atual.toString(),
      unidade_medida: material.unidade_medida,
      localizacao_pavilhao: material.localizacao_pavilhao || '',
      codigo_barras: material.codigo_barras,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (material: Material) => {
    if (!confirm(`Deseja realmente excluir "${material.nome}"?`)) {
      return;
    }

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials/${material.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'X-Access-Token': token,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao excluir material');
      }

      toast.success('Material excluído!');
      fetchMaterials();
    } catch (error: any) {
      console.error('Erro ao excluir material:', error);
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      tipo: 'Tecido',
      cor: '',
      quantidade_atual: '',
      unidade_medida: 'kg',
      localizacao_pavilhao: '',
      codigo_barras: '',
    });
    setEditingMaterial(null);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Materiais</h2>
          <p className="text-slate-600 mt-1">
            Gerencie o estoque de sobras do pavilhão
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4 mr-2" />
              Novo Material
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingMaterial ? 'Editar Material' : 'Novo Material'}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados do material abaixo
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Material *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Retalho Jeans Indigo"
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="codigo_barras">Código de Barras</Label>
                  <Input
                    id="codigo_barras"
                    value={formData.codigo_barras}
                    onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                    placeholder="Auto-gerado se vazio"
                    disabled={submitting || !!editingMaterial}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo *</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                    disabled={submitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tecido">Tecido</SelectItem>
                      <SelectItem value="Couro">Couro</SelectItem>
                      <SelectItem value="Plástico">Plástico</SelectItem>
                      <SelectItem value="Espuma">Espuma</SelectItem>
                      <SelectItem value="Papel">Papel</SelectItem>
                      <SelectItem value="Outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cor">Cor</Label>
                  <Input
                    id="cor"
                    value={formData.cor}
                    onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                    placeholder="Ex: Azul Escuro"
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantidade">Quantidade Inicial</Label>
                  <Input
                    id="quantidade"
                    type="number"
                    step="0.01"
                    value={formData.quantidade_atual}
                    onChange={(e) => setFormData({ ...formData, quantidade_atual: e.target.value })}
                    placeholder="0.00"
                    disabled={submitting || !!editingMaterial}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unidade">Unidade de Medida</Label>
                  <Select
                    value={formData.unidade_medida}
                    onValueChange={(value) => setFormData({ ...formData, unidade_medida: value })}
                    disabled={submitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg (Quilograma)</SelectItem>
                      <SelectItem value="m">m (Metro)</SelectItem>
                      <SelectItem value="m²">m² (Metro Quadrado)</SelectItem>
                      <SelectItem value="un">un (Unidade)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="localizacao">Localização no Pavilhão</Label>
                  <Input
                    id="localizacao"
                    value={formData.localizacao_pavilhao}
                    onChange={(e) => setFormData({ ...formData, localizacao_pavilhao: e.target.value })}
                    placeholder="Ex: A-01, B-15, etc"
                    disabled={submitting}
                  />
                </div>
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
                  className="bg-orange-500 hover:bg-orange-600"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Buscar por nome, código ou cor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="Tecido">Tecido</SelectItem>
                <SelectItem value="Couro">Couro</SelectItem>
                <SelectItem value="Plástico">Plástico</SelectItem>
                <SelectItem value="Espuma">Espuma</SelectItem>
                <SelectItem value="Papel">Papel</SelectItem>
                <SelectItem value="Outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Materials Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {materials.length} {materials.length === 1 ? 'Material' : 'Materiais'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">Nenhum material encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((material) => (
                    <TableRow key={material.id}>
                      <TableCell className="font-mono text-sm">
                        {material.codigo_barras}
                      </TableCell>
                      <TableCell className="font-medium">
                        {material.nome}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{material.tipo}</Badge>
                      </TableCell>
                      <TableCell>{material.cor || '-'}</TableCell>
                      <TableCell>
                        <span className={material.quantidade_atual < 10 ? 'text-red-600 font-semibold' : ''}>
                          {material.quantidade_atual} {material.unidade_medida}
                        </span>
                      </TableCell>
                      <TableCell>{material.localizacao_pavilhao || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(material)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(material)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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