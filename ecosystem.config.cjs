module.exports = {
  apps: [
    {
      name: 'sobracorte-api',
      cwd: './backend',
      script: 'dist/src/server.js',
      env: {
        NODE_ENV: 'production'
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000
    }
  ]
};
