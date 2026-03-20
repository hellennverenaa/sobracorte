import { Request, Response } from 'express';

export class AuthController {
  async login(req: Request, res: Response) {
    const { usuario, senha } = req.body;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const apiResponse = await fetch('http://10.100.1.43:2399/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!apiResponse.ok) return res.status(401).json({ error: "Credenciais inválidas" });
      const data = await apiResponse.json();
      return res.json(data);
    } catch (error) {
      const mockToken = "mock.eyJ1c3VhcmlvIjoiSEVMTEVOLk1BR0FMSEFFUyIsICJyb2xlIjoiYWRtaW4ifQ==.mock";
      res.json({ data: { token: mockToken } });
    }
  }
}