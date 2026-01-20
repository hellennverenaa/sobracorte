module.exports = {
  apps: [
    {
      name: "sobracorte-db",
      script: "cmd.exe",
      args: "/c npm run db",
      watch: false,
      autorestart: true
    },
    {
      name: "sobracorte-site",
      script: "cmd.exe",
      args: "/c npm run dev",
      watch: false,
      autorestart: true
    }
  ]
};