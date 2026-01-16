import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner@2.0.3';
import { Search, Plus, Edit, Trash2, Package, AlertTriangle, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface Material {
  id: string;
  codigo_barras: string;
  nome: string;
  tipo: string;
  cor: string;
  quantidade_atual: number;
  unidade_medida: string;
  localizacao_pavilhao: string;
  data_cadastro: string;
}

export function MateriaisPage() {
  const { accessToken } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    codigo_barras: '',
    nome: '',
    tipo: 'Tecido',
    cor: '',
    quantidade_atual: '',
    unidade_medida: 'm',
    localizacao_pavilhao: ''
  });

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    filterMaterials();
  }, [materials, searchTerm, filterTipo]);

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

  const filterMaterials = () => {
    let filtered = materials;

    if (searchTerm) {
      filtered = filtered.filter(m =>
        m.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.codigo_barras.includes(searchTerm)
      );
    }

    if (filterTipo !== 'all') {
      filtered = filtered.filter(m => m.tipo === filterTipo);
    }

    setFilteredMaterials(filtered);
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            ...formData,
            quantidade_atual: Number(formData.quantidade_atual)
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar material');
      }

      toast.success('Material cadastrado com sucesso!');
      setIsAddDialogOpen(false);
      resetForm();
      loadMaterials();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;

    setSubmitting(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials/${editingMaterial.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            ...formData,
            quantidade_atual: Number(formData.quantidade_atual)
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar material');
      }

      toast.success('Material atualizado com sucesso!');
      setIsEditDialogOpen(false);
      setEditingMaterial(null);
      resetForm();
      loadMaterials();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMaterial = async (id: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir "${nome}"?`)) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-ed830bfb/materials/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir material');
      }

      toast.success('Material excluído com sucesso!');
      loadMaterials();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const openEditDialog = (material: Material) => {
    setEditingMaterial(material);
    setFormData({
      codigo_barras: material.codigo_barras,
      nome: material.nome,
      tipo: material.tipo,
      cor: material.cor,
      quantidade_atual: material.quantidade_atual.toString(),
      unidade_medida: material.unidade_medida,
      localizacao_pavilhao: material.localizacao_pavilhao
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      codigo_barras: '',
      nome: '',
      tipo: 'Tecido',
      cor: '',
      quantidade_atual: '',
      unidade_medida: 'm',
      localizacao_pavilhao: ''
    });
  };

  const tipos = Array.from(new Set(materials.map(m => m.tipo)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Materiais</h1>
          <p className="text-slate-400">Gerenciar estoque de sobras e retalhos</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="mr-2 h-4 w-4" />
              Novo Material
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Material</DialogTitle>
              <DialogDescription className="text-slate-400">
                Preencha os dados do material de sobra
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddMaterial} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código de Barras</Label>
                  <Input
                    value={formData.codigo_barras}
                    onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                    className="bg-slate-900/50 border-slate-600"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Material</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="bg-slate-900/50 border-slate-600"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="Tecido">Tecido</SelectItem>
                      <SelectItem value="Papel">Papel</SelectItem>
                      <SelectItem value="Plástico">Plástico</SelectItem>
                      <SelectItem value="Couro">Couro</SelectItem>
                      <SelectItem value="Metal">Metal</SelectItem>
                      <SelectItem value="Espuma">Espuma</SelectItem>
                      <SelectItem value="Forro">Forro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <Input
                    value={formData.cor}
                    onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                    className="bg-slate-900/50 border-slate-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Localização</Label>
                  <Input
                    value={formData.localizacao_pavilhao}
                    onChange={(e) => setFormData({ ...formData, localizacao_pavilhao: e.target.value })}
                    className="bg-slate-900/50 border-slate-600"
                    placeholder="Ex: A1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade Inicial</Label>
                  <Input
                    type="number"
                    value={formData.quantidade_atual}
                    onChange={(e) => setFormData({ ...formData, quantidade_atual: e.target.value })}
                    className="bg-slate-900/50 border-slate-600"
                    required
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unidade de Medida</Label>
                  <Select value={formData.unidade_medida} onValueChange={(value) => setFormData({ ...formData, unidade_medida: value })}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="m">Metros (m)</SelectItem>
                      <SelectItem value="kg">Quilogramas (kg)</SelectItem>
                      <SelectItem value="un">Unidades (un)</SelectItem>
                      <SelectItem value="l">Litros (l)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="bg-orange-500 hover:bg-orange-600 flex-1" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Cadastrar Material
                </Button>
                <Button type="button" variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }} disabled={submitting}>
                  Cancelar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Filtros e Busca</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome ou código de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-600 text-white"
              />
            </div>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-48 bg-slate-900/50 border-slate-600 text-white">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">Todos os Tipos</SelectItem>
                {tipos.map(tipo => (
                  <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto" />
              <p className="text-slate-400 mt-4">Carregando materiais...</p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Nenhum material encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-800/50">
                    <TableHead className="text-slate-300">Código</TableHead>
                    <TableHead className="text-slate-300">Nome</TableHead>
                    <TableHead className="text-slate-300">Tipo</TableHead>
                    <TableHead className="text-slate-300">Cor</TableHead>
                    <TableHead className="text-slate-300">Quantidade</TableHead>
                    <TableHead className="text-slate-300">Localização</TableHead>
                    <TableHead className="text-slate-300 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((material) => (
                    <TableRow key={material.id} className="border-slate-700 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-slate-300">{material.codigo_barras}</TableCell>
                      <TableCell className="font-medium text-white">{material.nome}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-600 text-slate-300">
                          {material.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">{material.cor}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {material.quantidade_atual < 100 && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          <span className={material.quantidade_atual < 100 ? 'text-yellow-500 font-semibold' : 'text-slate-300'}>
                            {material.quantidade_atual} {material.unidade_medida}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300">{material.localizacao_pavilhao || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(material)}
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteMaterial(material.id, material.nome)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Material</DialogTitle>
            <DialogDescription className="text-slate-400">
              Atualize as informações do material
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditMaterial} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código de Barras</Label>
                <Input
                  value={formData.codigo_barras}
                  onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Nome do Material</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="Tecido">Tecido</SelectItem>
                    <SelectItem value="Papel">Papel</SelectItem>
                    <SelectItem value="Plástico">Plástico</SelectItem>
                    <SelectItem value="Couro">Couro</SelectItem>
                    <SelectItem value="Metal">Metal</SelectItem>
                    <SelectItem value="Espuma">Espuma</SelectItem>
                    <SelectItem value="Forro">Forro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <Input
                  value={formData.cor}
                  onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label>Localização</Label>
                <Input
                  value={formData.localizacao_pavilhao}
                  onChange={(e) => setFormData({ ...formData, localizacao_pavilhao: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  placeholder="Ex: A1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade Atual</Label>
                <Input
                  type="number"
                  value={formData.quantidade_atual}
                  onChange={(e) => setFormData({ ...formData, quantidade_atual: e.target.value })}
                  className="bg-slate-900/50 border-slate-600"
                  required
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade de Medida</Label>
                <Select value={formData.unidade_medida} onValueChange={(value) => setFormData({ ...formData, unidade_medida: value })}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="m">Metros (m)</SelectItem>
                    <SelectItem value="kg">Quilogramas (kg)</SelectItem>
                    <SelectItem value="un">Unidades (un)</SelectItem>
                    <SelectItem value="l">Litros (l)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600 flex-1" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Alterações
              </Button>
              <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingMaterial(null); resetForm(); }} disabled={submitting}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
