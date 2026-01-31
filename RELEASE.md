# Release checklist and legal positioning

Use this so the prototype can be released in a way that is **clearly non-clinical** and **legally cautious**. It is not legal advice; consider taking your own.

---

## 1. What you must do before “release”

### 1.1 Disclaimers (mandatory)

- **In the product**: Every user-facing entry point must show that it is a **research prototype**, **not for clinical use**, and **not a medical device**.  
  - Home, Assessment, and Admin/Clinician areas already include or link to this.
- **In docs**: README and any public description must state the same and that there is no warranty and no use for real clinical decisions.

### 1.2 Environment and access

- Set **ADMIN_NAME** and **ADMIN_PASSWORD** (and **ADMIN_SESSION_SECRET** if you use cookie signing). Use strong, unique values.
- Do not commit `.env` or real credentials. Use `.env.example` as a template only.
- Restrict who can reach the deployed app (e.g. VPN, invite-only, or unlisted URL) if you want to limit access.

### 1.3 Data and hosting

- Prefer **no real patient data** in this prototype. If you do store any, you need a lawful basis, retention policy, and (in the UK) compliance with UK GDPR and any NHS/customer data policies.
- Prefer **UK (or agreed) hosting** if you later involve NHS or UK patients.
- Use **HTTPS** in production.

### 1.4 Admin and “changed by” accountability

- Admin actions that change data (e.g. patient name) must be **attributed to the admin** (e.g. “Changed by [admin name]” and timestamp).  
- The app implements this for name edits so you have a simple audit trail.

---

## 2. Keeping it legal (positioning only – not legal advice)

- **Position the app as**:  
  - **Research/demonstration prototype**  
  - **Not for clinical or diagnostic use**  
  - **Not a medical device**  
  - **Not a substitute for professional care**
- **Do not**:  
  - Market it as suitable for real clinical decisions or live patient assessment  
  - Rely on it for safety-critical or regulatory decisions without further approval
- **If you might use it in or near real care pathways**, take proper legal and regulatory advice (e.g. MHRA, NICE, NHS IG, contracts).

---

## 3. Release steps (conceptual)

1. **Code and config**
   - [ ] All disclaimers in UI and README in place and visible.
   - [ ] `.env` created from `.env.example`; ADMIN_NAME, ADMIN_PASSWORD, DATABASE_URL, OPENAI_API_KEY set; nothing committed.
   - [ ] `npm run build` and `npm run start` (or your chosen deploy) work.

2. **Legal / positioning**
   - [ ] README and any public text state: research prototype, not for clinical use, not a medical device, no warranty.
   - [ ] You have decided who may access the app and how (e.g. “invite-only demo”).

3. **Deploy**
   - [ ] Deploy to your chosen host (Replit, Railway, Docker, etc.).
   - [ ] Confirm HTTPS and that admin login is required for admin (and optionally clinician) areas.
   - [ ] Test login and one “edit name” flow; confirm “Changed by [name]” appears as intended.

4. **After release**
   - [ ] Only share the URL with people who understand it is a non-clinical prototype.
   - [ ] If you collect any data, document purpose, lawful basis, and retention, and keep the “changed by” audit for admin edits.

---

## 4. Optional: tighten access further

- Put clinician and admin behind the same login, or add a second “clinician” role later.
- Add rate limiting or IP allowlisting for the admin/login endpoints.
- Log admin logins and edits (e.g. to a secure log or audit table) for accountability.
