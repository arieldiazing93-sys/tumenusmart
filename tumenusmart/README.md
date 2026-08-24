# TuMenuSmart

Menú digital + carrito + confirmación de pedido por WhatsApp. Sin pagos en línea: el cobro lo maneja el negocio directamente con el cliente.

## Qué incluye

- **Portal público** (`/`): catálogo por categorías, con variantes y agregados por producto.
- **Carrito y checkout** (`/carrito`, `/checkout`): genera el pedido y un link de WhatsApp con el resumen ya armado.
- **Panel admin** (`/admin`): productos, categorías, zonas de envío, configuración del negocio, y gestión de pedidos entrantes (cambio de estado).

## Desplegar (checklist, sin vueltas)

1. **GitHub**: crear una cuenta (si no tenés) → crear un repo nuevo llamado `tumenusmart` → subir esta carpeta.
2. **Supabase** (supabase.com): crear cuenta con "Continuar con GitHub" → crear un proyecto → copiar el `DATABASE_URL` (Project Settings → Database → Connection string). Ahí mismo, en "Storage", crear un bucket público llamado `productos` para las fotos del menú.
3. **Vercel** (vercel.com): crear cuenta con "Continuar con GitHub" → "Import Project" → elegir el repo.
4. En Vercel, variables de entorno del proyecto:
   - `DATABASE_URL`: la del paso 2
   - `ADMIN_PASSWORD`: una contraseña propia para entrar a `/admin`
   - `SESSION_SECRET`: cualquier string largo y random (ej. generado con `openssl rand -hex 32`)
5. Deploy. Vercel instala dependencias y compila solo.
6. Una sola vez, correr las migraciones y cargar los datos de ejemplo contra la base de producción:
   ```
   DATABASE_URL="<la de Supabase>" npx prisma migrate deploy
   DATABASE_URL="<la de Supabase>" npm run db:seed
   ```
   (Se puede correr desde tu máquina con Node instalado, o le paso el comando exacto cuando lleguemos a este paso.)
7. Entrar a `/admin`, cargar el menú real del negocio, reemplazar los datos de ejemplo.

## Desarrollo local (si en algún momento tenés Node + Postgres a mano)

```
npm install
cp .env.example .env   # completar DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

## Qué falta para las siguientes etapas del roadmap

- Multi-tenancy (varios negocios en la misma instancia) — hoy es de un solo negocio.
- Roles de empleado (hoy hay una sola contraseña de admin).
- Historial de clientes y métricas de ventas en el panel.
