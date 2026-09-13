export interface DecodedToken {
    id: string;
    usuario: string;
    codbarras: string;
    rfid: string;
    matricula?: string | null;
    setor: string;
    nivel: string;
    unidade: string;
    funcao: string;
    nome?: string;
    email?: string;
    role?: string;
    origem?: string;
}

export interface TenantContext {
    id: number;
    code: string;
    name: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: DecodedToken
            tenant?: TenantContext
            isGlobalAdmin?: boolean
        }
    }
}
