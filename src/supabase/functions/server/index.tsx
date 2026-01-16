import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";
import * as bcrypt from "npm:bcryptjs@2.4.3";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-Access-Token"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check
app.get("/make-server-ed830bfb/health", (c) => {
  return c.json({ status: "ok" });
});

// ========== AUTH ROUTES ==========

// Register new user
app.post("/make-server-ed830bfb/auth/register", async (c) => {
  try {
    const { nome, email, password, role = 'operador' } = await c.req.json();

    if (!nome || !email || !password) {
      return c.json({ error: "Nome, email e senha são obrigatórios" }, 400);
    }

    // Check if user already exists
    const existingUsers = await kv.getByPrefix('user_email_');
    const userExists = existingUsers.some((u: any) => u.email === email);
    
    if (userExists) {
      return c.json({ error: "Email já cadastrado" }, 400);
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since email server is not configured
      user_metadata: { nome, role }
    });

    if (authError) {
      console.log(`Error creating user in Supabase Auth: ${authError.message}`);
      return c.json({ error: authError.message }, 400);
    }

    // Store user data in KV
    const userData = {
      id: authData.user.id,
      nome,
      email,
      role,
      created_at: new Date().toISOString()
    };

    await kv.set(`user_${authData.user.id}`, userData);
    await kv.set(`user_email_${email}`, userData);

    return c.json({ 
      message: "Usuário cadastrado com sucesso", 
      user: { id: userData.id, nome, email, role } 
    }, 201);
  } catch (error) {
    console.log(`Error in register endpoint: ${error}`);
    return c.json({ error: "Erro ao registrar usuário" }, 500);
  }
});

// Login
app.post("/make-server-ed830bfb/auth/login", async (c) => {
  try {
    console.log('=== LOGIN ENDPOINT CALLED ===');
    
    const body = await c.req.json();
    const { email, password } = body;

    console.log('Login attempt for email:', email);

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return c.json({ error: "Email e senha são obrigatórios" }, 400);
    }

    console.log('Attempting Supabase Auth sign in...');
    
    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log(`❌ Supabase Auth error: ${error.message}`);
      console.log(`Error details:`, JSON.stringify(error, null, 2));
      return c.json({ error: "Credenciais inválidas" }, 401);
    }

    if (!data.session || !data.user) {
      console.log('❌ No session or user returned from Supabase');
      return c.json({ error: "Erro ao criar sessão" }, 401);
    }

    console.log(`✅ User authenticated: ${data.user.id}`);
    console.log(`User metadata:`, data.user.user_metadata);

    // Get user data from KV
    const userData = await kv.get(`user_${data.user.id}`);

    console.log(`User data from KV:`, userData ? 'found' : 'not found');

    const userResponse = userData || {
      id: data.user.id,
      nome: data.user.user_metadata.nome || data.user.email?.split('@')[0] || 'Usuário',
      email: data.user.email,
      role: data.user.user_metadata.role || 'operador'
    };

    console.log(`✅ Login successful for user: ${userResponse.nome}`);

    return c.json({
      message: "Login realizado com sucesso",
      access_token: data.session.access_token,
      user: userResponse
    });
  } catch (error) {
    console.error(`❌ Error in login endpoint:`, error);
    console.error(`Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    return c.json({ error: "Erro ao fazer login" }, 500);
  }
});

// Get current user
app.get("/make-server-ed830bfb/auth/me", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: "Token não fornecido" }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      return c.json({ error: "Token inválido" }, 401);
    }

    const userData = await kv.get(`user_${user.id}`);

    return c.json({
      user: userData || {
        id: user.id,
        nome: user.user_metadata.nome,
        email: user.email,
        role: user.user_metadata.role || 'operador'
      }
    });
  } catch (error) {
    console.log(`Error in /auth/me endpoint: ${error}`);
    return c.json({ error: "Erro ao buscar usuário" }, 500);
  }
});

// ========== MATERIALS ROUTES ==========

// List all materials (with filters)
app.get("/make-server-ed830bfb/materials", async (c) => {
  try {
    const tipo = c.req.query('tipo');
    const cor = c.req.query('cor');
    const search = c.req.query('search');

    let materials = await kv.getByPrefix('material_');

    // Apply filters
    if (tipo) {
      materials = materials.filter((m: any) => m.tipo === tipo);
    }
    if (cor) {
      materials = materials.filter((m: any) => m.cor?.toLowerCase().includes(cor.toLowerCase()));
    }
    if (search) {
      const searchLower = search.toLowerCase();
      materials = materials.filter((m: any) => 
        m.nome?.toLowerCase().includes(searchLower) ||
        m.codigo_barras?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by creation date (newest first)
    materials.sort((a: any, b: any) => 
      new Date(b.data_cadastro).getTime() - new Date(a.data_cadastro).getTime()
    );

    return c.json({ materials });
  } catch (error) {
    console.log(`Error listing materials: ${error}`);
    return c.json({ error: "Erro ao listar materiais" }, 500);
  }
});

// Get single material
app.get("/make-server-ed830bfb/materials/:id", async (c) => {
  try {
    const id = c.req.param('id');
    const material = await kv.get(`material_${id}`);

    if (!material) {
      return c.json({ error: "Material não encontrado" }, 404);
    }

    return c.json({ material });
  } catch (error) {
    console.log(`Error getting material: ${error}`);
    return c.json({ error: "Erro ao buscar material" }, 500);
  }
});

// Create material
app.post("/make-server-ed830bfb/materials", async (c) => {
  try {
    console.log('=== CREATE MATERIAL ENDPOINT CALLED ===');
    
    // Try both Authorization header and custom X-Access-Token header
    let accessToken = c.req.header('X-Access-Token');
    console.log('X-Access-Token present:', !!accessToken);
    
    if (!accessToken) {
      const authHeader = c.req.header('Authorization');
      console.log('Authorization header:', authHeader ? `${authHeader.substring(0, 30)}...` : 'NOT PRESENT');
      accessToken = authHeader?.split(' ')[1];
    }
    
    if (!accessToken) {
      console.log('❌ No access token provided for material creation');
      return c.json({ error: "Token não fornecido" }, 401);
    }
    
    console.log('Token found, length:', accessToken.length);
    console.log('Verifying token with Supabase...');
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError) {
      console.log(`❌ Auth error creating material: ${authError.message}`);
      return c.json({ error: `Não autorizado: ${authError.message}` }, 401);
    }
    
    if (!user) {
      console.log('❌ No user returned from Supabase');
      return c.json({ error: "Não autorizado" }, 401);
    }

    console.log(`✅ User authenticated: ${user.id}`);

    const body = await c.req.json();
    const { codigo_barras, nome, tipo, cor, quantidade_atual, unidade_medida, localizacao_pavilhao } = body;

    console.log('Material data:', { codigo_barras, nome, tipo, quantidade_atual, unidade_medida });

    if (!codigo_barras || !nome || !tipo || quantidade_atual === undefined || !unidade_medida) {
      console.log('❌ Missing required fields');
      return c.json({ error: "Campos obrigatórios: codigo_barras, nome, tipo, quantidade_atual, unidade_medida" }, 400);
    }

    const id = crypto.randomUUID();
    const material = {
      id,
      codigo_barras,
      nome,
      tipo,
      cor: cor || '',
      quantidade_atual: parseFloat(quantidade_atual),
      unidade_medida,
      localizacao_pavilhao: localizacao_pavilhao || '',
      data_cadastro: new Date().toISOString()
    };

    await kv.set(`material_${id}`, material);

    console.log(`✅ Material created successfully: ${id}`);
    return c.json({ message: "Material criado com sucesso", material }, 201);
  } catch (error) {
    console.error(`❌ Error creating material:`, error);
    return c.json({ error: `Erro ao criar material: ${error}` }, 500);
  }
});

// Update material
app.put("/make-server-ed830bfb/materials/:id", async (c) => {
  try {
    // Try both Authorization header and custom X-Access-Token header
    let accessToken = c.req.header('X-Access-Token');
    if (!accessToken) {
      accessToken = c.req.header('Authorization')?.split(' ')[1];
    }
    
    if (!accessToken) {
      console.log('No access token provided for material update');
      return c.json({ error: "Token não fornecido" }, 401);
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      console.log(`Auth error updating material: ${authError?.message}`);
      return c.json({ error: "Não autorizado" }, 401);
    }

    const id = c.req.param('id');
    const existingMaterial = await kv.get(`material_${id}`);

    if (!existingMaterial) {
      console.log(`Material not found for update: ${id}`);
      return c.json({ error: "Material não encontrado" }, 404);
    }

    const body = await c.req.json();
    
    // Convert quantidade_atual to number if it exists in the update
    if (body.quantidade_atual !== undefined) {
      body.quantidade_atual = parseFloat(body.quantidade_atual);
    }
    
    const updatedMaterial = {
      ...existingMaterial,
      ...body,
      id, // Ensure ID doesn't change
      data_cadastro: existingMaterial.data_cadastro // Preserve creation date
    };

    await kv.set(`material_${id}`, updatedMaterial);

    console.log(`Material updated successfully: ${id}`);
    return c.json({ message: "Material atualizado com sucesso", material: updatedMaterial });
  } catch (error) {
    console.log(`Error updating material: ${error}`);
    return c.json({ error: "Erro ao atualizar material" }, 500);
  }
});

// Delete material
app.delete("/make-server-ed830bfb/materials/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return c.json({ error: "Não autorizado" }, 401);
    }

    const id = c.req.param('id');
    const material = await kv.get(`material_${id}`);

    if (!material) {
      return c.json({ error: "Material não encontrado" }, 404);
    }

    await kv.del(`material_${id}`);

    return c.json({ message: "Material deletado com sucesso" });
  } catch (error) {
    console.log(`Error deleting material: ${error}`);
    return c.json({ error: "Erro ao deletar material" }, 500);
  }
});

// ========== TRANSACTIONS ROUTES ==========

// Register movement (entrada/saida)
app.post("/make-server-ed830bfb/transactions", async (c) => {
  try {
    console.log('=== TRANSACTION ENDPOINT CALLED ===');
    
    // Get access token from custom header
    const accessToken = c.req.header('X-Access-Token');
    
    console.log('Access token present:', !!accessToken);
    
    if (!accessToken) {
      console.log('❌ No access token provided for transaction');
      return c.json({ error: "Token não fornecido" }, 401);
    }
    
    console.log('Verifying token with Supabase...');
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError) {
      console.log(`❌ Auth error: ${authError.message}`);
      return c.json({ error: `Não autorizado: ${authError.message}` }, 401);
    }
    
    if (!user) {
      console.log('❌ No user found');
      return c.json({ error: "Usuário não encontrado" }, 401);
    }

    console.log(`✅ User authenticated: ${user.id}`);

    const body = await c.req.json();
    const { material_id, type, quantidade } = body;

    console.log(`📥 Transaction request: material_id=${material_id}, type=${type}, quantidade=${quantidade}`);

    if (!material_id || !type || quantidade === undefined) {
      console.log(`❌ Missing required fields`);
      return c.json({ error: "Campos obrigatórios: material_id, type, quantidade" }, 400);
    }

    if (!['ENTRADA', 'SAIDA'].includes(type)) {
      console.log(`❌ Invalid transaction type: ${type}`);
      return c.json({ error: "Type deve ser 'ENTRADA' ou 'SAIDA'" }, 400);
    }

    // Get material
    console.log(`Getting material: ${material_id}`);
    const material = await kv.get(`material_${material_id}`);
    if (!material) {
      console.log(`❌ Material not found: ${material_id}`);
      return c.json({ error: "Material não encontrado" }, 404);
    }

    console.log(`✅ Material found: ${material.nome}`);

    const qtd = parseFloat(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      console.log(`❌ Invalid quantity: ${quantidade}`);
      return c.json({ error: "Quantidade deve ser um número maior que zero" }, 400);
    }

    console.log(`Current stock: ${material.quantidade_atual}, Transaction: ${type} ${qtd}`);

    // Calculate new quantity
    let new_quantity = parseFloat(material.quantidade_atual);
    if (type === 'ENTRADA') {
      new_quantity += qtd;
    } else {
      new_quantity -= qtd;
      if (new_quantity < 0) {
        console.log(`❌ Insufficient stock: current=${material.quantidade_atual}, requested=${qtd}`);
        return c.json({ error: "Estoque insuficiente para esta saída" }, 400);
      }
    }

    console.log(`New stock will be: ${new_quantity}`);

    // Create transaction
    const transactionId = crypto.randomUUID();
    const transaction = {
      id: transactionId,
      type,
      quantidade: qtd,
      data_hora: new Date().toISOString(),
      material_id,
      material_nome: material.nome,
      user_id: user.id,
      user_nome: user.user_metadata?.nome || user.email || 'Usuário'
    };

    // Update material quantity
    const updatedMaterial = {
      ...material,
      quantidade_atual: new_quantity
    };

    console.log('Saving to database...');
    await kv.set(`material_${material_id}`, updatedMaterial);
    await kv.set(`transaction_${transactionId}`, transaction);

    console.log(`✅ Transaction ${transactionId} created successfully`);

    return c.json({ 
      message: "Movimentação registrada com sucesso", 
      transaction,
      material: updatedMaterial
    }, 201);
  } catch (error) {
    console.error(`❌ Error creating transaction:`, error);
    console.error(`Error details:`, JSON.stringify(error, null, 2));
    return c.json({ 
      error: `Erro ao registrar movimentação: ${error instanceof Error ? error.message : String(error)}` 
    }, 500);
  }
});

// List transactions
app.get("/make-server-ed830bfb/transactions", async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100');
    const material_id = c.req.query('material_id');

    let transactions = await kv.getByPrefix('transaction_');

    // Filter by material if specified
    if (material_id) {
      transactions = transactions.filter((t: any) => t.material_id === material_id);
    }

    // Sort by date (newest first)
    transactions.sort((a: any, b: any) => 
      new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
    );

    // Limit results
    transactions = transactions.slice(0, limit);

    return c.json({ transactions });
  } catch (error) {
    console.log(`Error listing transactions: ${error}`);
    return c.json({ error: "Erro ao listar transações" }, 500);
  }
});

// ========== SEED DATA ==========

// Seed database with sample materials
app.post("/make-server-ed830bfb/seed", async (c) => {
  try {
    const sampleMaterials = [
      // Tecidos
      { codigo_barras: "TEC001", nome: "Retalho Jeans Índigo", tipo: "Tecido", cor: "Azul", quantidade: 15.5, unidade: "kg", localizacao: "A1" },
      { codigo_barras: "TEC002", nome: "Sobras de Lycra Preta", tipo: "Tecido", cor: "Preto", quantidade: 8.2, unidade: "kg", localizacao: "A2" },
      { codigo_barras: "TEC003", nome: "Algodão Cru Excedente", tipo: "Tecido", cor: "Bege", quantidade: 22.0, unidade: "kg", localizacao: "A3" },
      { codigo_barras: "TEC004", nome: "Malha PV Branca", tipo: "Tecido", cor: "Branco", quantidade: 12.7, unidade: "kg", localizacao: "A1" },
      { codigo_barras: "TEC005", nome: "Seda Estampada Floral", tipo: "Tecido", cor: "Multicolor", quantidade: 5.3, unidade: "kg", localizacao: "B1" },
      { codigo_barras: "TEC006", nome: "Linho Natural", tipo: "Tecido", cor: "Cru", quantidade: 18.9, unidade: "kg", localizacao: "B2" },
      { codigo_barras: "TEC007", nome: "Viscose Verde Musgo", tipo: "Tecido", cor: "Verde", quantidade: 9.1, unidade: "kg", localizacao: "A2" },
      { codigo_barras: "TEC008", nome: "Moletom Cinza Mescla", tipo: "Tecido", cor: "Cinza", quantidade: 14.6, unidade: "kg", localizacao: "C1" },
      { codigo_barras: "TEC009", nome: "Cetim Vermelho", tipo: "Tecido", cor: "Vermelho", quantidade: 6.8, unidade: "kg", localizacao: "B3" },
      { codigo_barras: "TEC010", nome: "Oxford Azul Marinho", tipo: "Tecido", cor: "Azul", quantidade: 20.3, unidade: "kg", localizacao: "C2" },
      
      // Plásticos
      { codigo_barras: "PLA001", nome: "Lona PVC Transparente", tipo: "Plástico", cor: "Transparente", quantidade: 45.0, unidade: "m", localizacao: "D1" },
      { codigo_barras: "PLA002", nome: "Polietileno Preto", tipo: "Plástico", cor: "Preto", quantidade: 32.5, unidade: "m", localizacao: "D2" },
      { codigo_barras: "PLA003", nome: "Acrílico Cristal 3mm", tipo: "Plástico", cor: "Transparente", quantidade: 12.0, unidade: "m²", localizacao: "E1" },
      { codigo_barras: "PLA004", nome: "EVA Colorido Sortido", tipo: "Plástico", cor: "Multicolor", quantidade: 150.0, unidade: "un", localizacao: "D3" },
      { codigo_barras: "PLA005", nome: "Polipropileno Ondulado", tipo: "Plástico", cor: "Branco", quantidade: 28.0, unidade: "m²", localizacao: "E2" },
      { codigo_barras: "PLA006", nome: "Vinil Adesivo Branco", tipo: "Plástico", cor: "Branco", quantidade: 18.7, unidade: "m", localizacao: "D1" },
      { codigo_barras: "PLA007", nome: "PET Reciclado", tipo: "Plástico", cor: "Transparente", quantidade: 55.3, unidade: "kg", localizacao: "F1" },
      { codigo_barras: "PLA008", nome: "Espuma EVA 5mm", tipo: "Plástico", cor: "Preto", quantidade: 89.0, unidade: "un", localizacao: "D2" },
      
      // Papéis
      { codigo_barras: "PAP001", nome: "Papel Kraft 200g", tipo: "Papel", cor: "Marrom", quantidade: 120.0, unidade: "kg", localizacao: "G1" },
      { codigo_barras: "PAP002", nome: "Cartolina Branca", tipo: "Papel", cor: "Branco", quantidade: 85.5, unidade: "un", localizacao: "G2" },
      { codigo_barras: "PAP003", nome: "Papelão Ondulado", tipo: "Papel", cor: "Marrom", quantidade: 95.0, unidade: "m²", localizacao: "G3" },
      { codigo_barras: "PAP004", nome: "Papel Fotográfico A4", tipo: "Papel", cor: "Branco", quantidade: 45.0, unidade: "un", localizacao: "H1" },
      { codigo_barras: "PAP005", nome: "Papel Color Plus Vermelho", tipo: "Papel", cor: "Vermelho", quantidade: 32.0, unidade: "kg", localizacao: "G1" },
      { codigo_barras: "PAP006", nome: "Papel Vegetal A3", tipo: "Papel", cor: "Transparente", quantidade: 28.0, unidade: "un", localizacao: "H2" },
      { codigo_barras: "PAP007", nome: "Papel Reciclado 90g", tipo: "Papel", cor: "Cru", quantidade: 67.8, unidade: "kg", localizacao: "G2" },
      
      // Couros e Sintéticos
      { codigo_barras: "COU001", nome: "Couro Sintético Preto", tipo: "Couro", cor: "Preto", quantidade: 11.2, unidade: "m²", localizacao: "I1" },
      { codigo_barras: "COU002", nome: "Corino Marrom", tipo: "Couro", cor: "Marrom", quantidade: 8.5, unidade: "m²", localizacao: "I2" },
      { codigo_barras: "COU003", nome: "Napa Legítima Caramelo", tipo: "Couro", cor: "Caramelo", quantidade: 4.3, unidade: "m²", localizacao: "I1" },
      { codigo_barras: "COU004", nome: "Suede Cinza", tipo: "Couro", cor: "Cinza", quantidade: 6.7, unidade: "m²", localizacao: "I3" },
      
      // Espumas e Isolantes
      { codigo_barras: "ESP001", nome: "Espuma D28 Densidade", tipo: "Espuma", cor: "Branco", quantidade: 25.0, unidade: "m³", localizacao: "J1" },
      { codigo_barras: "ESP002", nome: "Espuma D33 Alta Resiliência", tipo: "Espuma", cor: "Branco", quantidade: 18.5, unidade: "m³", localizacao: "J2" },
      { codigo_barras: "ESP003", nome: "Isolante Térmico Aluminizado", tipo: "Isolante", cor: "Prata", quantidade: 42.0, unidade: "m²", localizacao: "K1" },
      { codigo_barras: "ESP004", nome: "Manta Acrílica", tipo: "Espuma", cor: "Branco", quantidade: 31.2, unidade: "m²", localizacao: "J1" },
      
      // Metais (sobras de corte)
      { codigo_barras: "MET001", nome: "Chapas de Aço 1mm", tipo: "Metal", cor: "Cinza", quantidade: 150.0, unidade: "kg", localizacao: "L1" },
      { codigo_barras: "MET002", nome: "Alumínio Anodizado", tipo: "Metal", cor: "Prata", quantidade: 78.5, unidade: "kg", localizacao: "L2" },
      { codigo_barras: "MET003", nome: "Aço Inox 304", tipo: "Metal", cor: "Prata", quantidade: 45.3, unidade: "kg", localizacao: "L1" },
      { codigo_barras: "MET004", nome: "Cobre em Tiras", tipo: "Metal", cor: "Cobre", quantidade: 12.8, unidade: "kg", localizacao: "L3" },
      
      // Borrachas
      { codigo_barras: "BOR001", nome: "Borracha Neoprene 3mm", tipo: "Borracha", cor: "Preto", quantidade: 35.0, unidade: "m²", localizacao: "M1" },
      { codigo_barras: "BOR002", nome: "Borracha EPDM", tipo: "Borracha", cor: "Preto", quantidade: 22.5, unidade: "m²", localizacao: "M2" },
      { codigo_barras: "BOR003", nome: "Borracha Nitrílica", tipo: "Borracha", cor: "Verde", quantidade: 18.0, unidade: "kg", localizacao: "M1" },
      
      // Compósitos
      { codigo_barras: "COM001", nome: "Fibra de Vidro", tipo: "Compósito", cor: "Branco", quantidade: 28.0, unidade: "m²", localizacao: "N1" },
      { codigo_barras: "COM002", nome: "Fibra de Carbono", tipo: "Compósito", cor: "Preto", quantidade: 8.5, unidade: "m²", localizacao: "N2" },
      { codigo_barras: "COM003", nome: "MDF 15mm Recortes", tipo: "Compósito", cor: "Marrom", quantidade: 45.0, unidade: "m²", localizacao: "N3" },
      { codigo_barras: "COM004", nome: "Compensado Naval", tipo: "Compósito", cor: "Bege", quantidade: 32.5, unidade: "m²", localizacao: "N1" },
      
      // Acessórios de corte
      { codigo_barras: "ACE001", nome: "Fitas de Borda PVC", tipo: "Acessório", cor: "Branco", quantidade: 250.0, unidade: "m", localizacao: "O1" },
      { codigo_barras: "ACE002", nome: "Viés Algodão Colorido", tipo: "Acessório", cor: "Multicolor", quantidade: 180.0, unidade: "m", localizacao: "O2" },
      { codigo_barras: "ACE003", nome: "Entretela Termocolante", tipo: "Acessório", cor: "Branco", quantidade: 65.0, unidade: "m", localizacao: "O1" },
      { codigo_barras: "ACE004", nome: "Elástico Chato 20mm", tipo: "Acessório", cor: "Preto", quantidade: 320.0, unidade: "m", localizacao: "O3" },
    ];

    const createdMaterials = [];

    for (const item of sampleMaterials) {
      const id = crypto.randomUUID();
      const material = {
        id,
        codigo_barras: item.codigo_barras,
        nome: item.nome,
        tipo: item.tipo,
        cor: item.cor,
        quantidade_atual: item.quantidade,
        unidade_medida: item.unidade,
        localizacao_pavilhao: item.localizacao,
        data_cadastro: new Date().toISOString()
      };

      await kv.set(`material_${id}`, material);
      createdMaterials.push(material);
    }

    return c.json({ 
      message: `${createdMaterials.length} materiais criados com sucesso`, 
      materials: createdMaterials 
    }, 201);
  } catch (error) {
    console.log(`Error seeding database: ${error}`);
    return c.json({ error: "Erro ao popular banco de dados" }, 500);
  }
});

// Get dashboard stats
app.get("/make-server-ed830bfb/stats", async (c) => {
  try {
    const materials = await kv.getByPrefix('material_');
    const transactions = await kv.getByPrefix('transaction_');

    // Today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count materials with low stock (< 10 units)
    const lowStock = materials.filter((m: any) => m.quantidade_atual < 10).length;

    // Count today's transactions
    const todayTransactions = transactions.filter((t: any) => {
      const transDate = new Date(t.data_hora);
      transDate.setHours(0, 0, 0, 0);
      return transDate.getTime() === today.getTime();
    }).length;

    // Count by type
    const entradas = transactions.filter((t: any) => t.type === 'ENTRADA').length;
    const saidas = transactions.filter((t: any) => t.type === 'SAIDA').length;

    return c.json({
      total_materials: materials.length,
      low_stock_count: lowStock,
      today_transactions: todayTransactions,
      total_entradas: entradas,
      total_saidas: saidas
    });
  } catch (error) {
    console.log(`Error getting stats: ${error}`);
    return c.json({ error: "Erro ao buscar estatísticas" }, 500);
  }
});

// ========== ADMIN ROUTES ==========

// Update user role (admin only)
app.put("/make-server-ed830bfb/admin/users/:userId/role", async (c) => {
  try {
    console.log('=== UPDATE USER ROLE ENDPOINT CALLED ===');
    
    // Authenticate requesting user
    let accessToken = c.req.header('X-Access-Token');
    if (!accessToken) {
      accessToken = c.req.header('Authorization')?.split(' ')[1];
    }
    
    if (!accessToken) {
      console.log('❌ No access token provided');
      return c.json({ error: "Token não fornecido" }, 401);
    }
    
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !requestingUser) {
      console.log(`❌ Auth error: ${authError?.message}`);
      return c.json({ error: "Não autorizado" }, 401);
    }

    // Check if requesting user is admin
    const requestingUserData = await kv.get(`user_${requestingUser.id}`);
    const isAdmin = requestingUserData?.role === 'admin' || requestingUser.user_metadata?.role === 'admin';
    
    if (!isAdmin) {
      console.log(`❌ User ${requestingUser.id} is not admin`);
      return c.json({ error: "Apenas administradores podem alterar roles" }, 403);
    }

    // Get target user ID and new role from request
    const userId = c.req.param('userId');
    const { role } = await c.req.json();

    console.log(`Admin ${requestingUser.id} attempting to change user ${userId} role to: ${role}`);

    if (!role || !['operador', 'admin'].includes(role)) {
      return c.json({ error: "Role deve ser 'operador' ou 'admin'" }, 400);
    }

    // Update user metadata in Supabase Auth
    const { data: updatedAuthUser, error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      { user_metadata: { role } }
    );

    if (updateError) {
      console.log(`❌ Error updating user in Supabase Auth: ${updateError.message}`);
      return c.json({ error: updateError.message }, 400);
    }

    // Update user in KV store
    const userData = await kv.get(`user_${userId}`);
    if (userData) {
      const updatedUserData = { ...userData, role };
      await kv.set(`user_${userId}`, updatedUserData);
      
      // Also update email-indexed entry
      if (userData.email) {
        await kv.set(`user_email_${userData.email}`, updatedUserData);
      }
    }

    console.log(`✅ User ${userId} role updated to ${role}`);

    return c.json({ 
      message: "Role atualizado com sucesso",
      user: {
        id: userId,
        role: role,
        nome: userData?.nome || updatedAuthUser.user?.user_metadata?.nome
      }
    });
  } catch (error) {
    console.error(`❌ Error updating user role:`, error);
    return c.json({ error: "Erro ao atualizar role do usuário" }, 500);
  }
});

// List all users (admin only)
app.get("/make-server-ed830bfb/admin/users", async (c) => {
  try {
    // Authenticate requesting user
    let accessToken = c.req.header('X-Access-Token');
    if (!accessToken) {
      accessToken = c.req.header('Authorization')?.split(' ')[1];
    }
    
    if (!accessToken) {
      return c.json({ error: "Token não fornecido" }, 401);
    }
    
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !requestingUser) {
      return c.json({ error: "Não autorizado" }, 401);
    }

    // Check if requesting user is admin
    const requestingUserData = await kv.get(`user_${requestingUser.id}`);
    const isAdmin = requestingUserData?.role === 'admin' || requestingUser.user_metadata?.role === 'admin';
    
    if (!isAdmin) {
      return c.json({ error: "Apenas administradores podem listar usuários" }, 403);
    }

    // Get all users from KV store
    const users = await kv.getByPrefix('user_');
    
    // Filter out email-indexed duplicates (keep only user_<id> entries)
    const uniqueUsers = users.filter((u: any) => 
      u.id && !u.id.includes('email_')
    );

    // Sort by creation date
    uniqueUsers.sort((a: any, b: any) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return c.json({ users: uniqueUsers });
  } catch (error) {
    console.error(`❌ Error listing users:`, error);
    return c.json({ error: "Erro ao listar usuários" }, 500);
  }
});

Deno.serve(app.fetch);