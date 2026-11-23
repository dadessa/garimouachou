# Garimou Achou

Analise o prompt e faça ajustes antes e criar, caso seja necessário

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://garimouachou.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8e947436-c21b-4668-bad4-e25f4a373ac1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Primeiro administrador (Etapa 2)

Não há cadastro público (novos cadastros estão desativados no login do Lovable Cloud).

1. No Lovable, abra **Cloud → Users** e clique em **Add user**: informe o e-mail e uma senha forte.
2. Em **Cloud → Database → SQL**, rode (troque o e-mail):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'SEU-EMAIL@exemplo.com'
on conflict do nothing;
```

3. Entre em `/admin/login` com esse e-mail e senha.

## Painel (Etapa 2 Parte B)
- Login: `/admin/login` (com "Esqueci minha senha"). Nova senha: `/admin/redefinir-senha`.
- Sem cadastro público: novos cadastros estão desativados no Lovable Cloud.
- Fotos ficam em pastas privadas e o site as mostra pelo endereço `/img/...`.
