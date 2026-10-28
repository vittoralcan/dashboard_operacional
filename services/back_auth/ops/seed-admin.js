// Cria o primeiro usuário admin do sistema — rodar uma única vez, manualmente,
// depois de aplicar schema.sql. Depois disso, novos usuários (admin ou
// standard) são criados pela própria UI (POST /api/auth/usuarios), nunca
// mais por este script.
//
// O admin criado já sai com precisa_trocar_senha = true: ele troca a senha
// no primeiro login, então a senha passada aqui é só provisória.
//
// Uso: node ops/seed-admin.js "Nome Completo" login email@dominio.com <SENHA>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db-postgres');

const SALT_ROUNDS = 12;

async function main() {
    const [nome, login, email, senha] = process.argv.slice(2);
    if (!nome || !login || !email || !senha) {
        console.error('Uso: node ops/seed-admin.js "<nome completo>" <login> <email> <senha>');
        process.exitCode = 1;
        return;
    }
    if (senha.length < 12) {
        console.error('Senha deve ter ao menos 12 caracteres.');
        process.exitCode = 1;
        return;
    }

    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    const result = await pool.query(
        `INSERT INTO usuarios (nome, login, email, senha_hash, tipo, precisa_trocar_senha)
         VALUES ($1, $2, $3, $4, 'admin', true)
         RETURNING id, nome, login, email, tipo`,
        [nome.trim(), login.trim().toLowerCase(), email.trim().toLowerCase(), senhaHash]
    );

    console.log('Admin criado com sucesso:', result.rows[0]);
}

main()
    .catch((error) => {
        console.error('Erro ao criar admin inicial:', error.message || error);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
