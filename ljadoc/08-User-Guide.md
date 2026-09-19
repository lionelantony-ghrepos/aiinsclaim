# aiinsclaim — User guide

End-user narrative for the claims workspace. **Update this file only when user-visible UI or commands ship** (delta per PBI). Spec and agent docs stay in `ljadoc/PRD.md`, `ljadoc/DESIGN.md`, and `ljadoc/kb/`.

## Current release (PBI-003)

The Ledger workbench requires sign-in. Each demo role lands on its own home view and sees only the navigation items permitted for that role.

### Sign in

1. Run the app locally (see Quick start below) or open your deployed URL.
2. Go to **Sign in** (`/login`).
3. Enter a demo email and password `demo1234`, or pick an account from the list on the page.

After sign-in:

- **Claimants** open **My claims**.
- **Intake agents** open **Assisted intake**.
- **Adjusters** and **SIU analysts** open **Work queue**.
- **Supervisors** open **Operations**.
- **Admins** open **Rules**.

Use **Sign out** in the top bar to end your session. Protected pages redirect back to sign-in when you are not authenticated.

### Quick start (developer/demo)

```bash
npm install
npm run db:push
npm run seed
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

- Theme toggle is in the top bar (sun/moon).
- Component lab: [http://localhost:3000/dev/components](http://localhost:3000/dev/components) (after sign-in).
- Demo accounts: see [ljadev/README.md](../ljadev/README.md).

---

_Future sections (FNOL wizard, staff queues, admin rules editing) will be appended here as later PBIs ship._
