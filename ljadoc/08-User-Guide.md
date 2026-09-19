# aiinsclaim — User guide

End-user narrative for the claims workspace. **Update this file only when user-visible UI or commands ship** (delta per PBI). Spec and agent docs stay in `ljadoc/PRD.md`, `ljadoc/DESIGN.md`, and `ljadoc/kb/`.

## Current release (PBI-002)

The Ledger workbench shell is in place: dark-mode-first theme, sidebar navigation, and a component lab. Sign-in is not wired yet — use the **Preview role** control in the top bar to see claimant, staff, or admin nav.

### Quick start (developer/demo)

```bash
npm install
npm run db:push
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Theme toggle is in the top bar (sun/moon).
- Component lab: [http://localhost:3000/dev/components](http://localhost:3000/dev/components).
- Demo accounts (after seed): see [ljadev/README.md](../ljadev/README.md). Login lands in PBI-003.

---

_Future sections (FNOL wizard, staff queues, admin rules) will be appended here as later PBIs ship._
