module.exports = {
  apps: [
    {
      name: "sobracorte-db",
      // Truque para Windows: Chamamos o CMD, não o NPM direto
      cwd: "./frontend",
      script: "cmd.exe",
      args: "/c npm run db",
      watch: false,
      autorestart: true
    },
    {
      name: "sobracorte-site",
      cwd: "./frontend",
      script: "cmd.exe",
      args: "/c npm run dev",
      watch: false,
      autorestart: true
    }
  ]
};