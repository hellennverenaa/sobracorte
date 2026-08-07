export interface DecodedToken {
    id: string;
    usuario: string;
    codbarras: string;
    rfid: string;
    matricula: string;
    setor: string;
    nivel: string;
    unidade: string;
    funcao: string;
    nome?: string;
    email?: string;
    role?: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: DecodedToken
        }
    }
}
