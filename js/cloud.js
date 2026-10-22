// Ear & Pen: sign-in and cloud saving (Firebase Auth + Cloud Firestore), the same way as Pip's Sky Islands.
// The app talks only to the object returned by startCloud(), so this file is the single place that knows about Firebase.
// Data layout (owner-only, see firestore.rules):
//   users/{uid}   data (JSON text of the synced object, see merge.js), ts, v
const VERSION = "12.19.0";
const BASE = `https://www.gstatic.com/firebasejs/${VERSION}/`;

export async function startCloud(cfg) {
  if (!cfg || !cfg.apiKey) return null;
  const [A, AU, FS] = await Promise.all([
    import(BASE + "firebase-app.js"),
    import(BASE + "firebase-auth.js"),
    import(BASE + "firebase-firestore.js"),
  ]);
  const app = A.initializeApp(cfg);
  const auth = AU.getAuth(app);
  auth.languageCode = "ru";
  let db;
  try {
    db = FS.initializeFirestore(app, { localCache: FS.persistentLocalCache({ tabManager: FS.persistentMultipleTabManager() }) });
  } catch (e) {
    db = FS.getFirestore(app); // private browsing etc.: memory cache only (the app keeps its own copy anyway)
  }
  const me = () => {
    const u = auth.currentUser;
    if (!u) throw Object.assign(new Error("Not signed in"), { code: "auth/no-user" });
    return u.uid;
  };
  const ref = () => FS.doc(db, "users", me());
  const parse = s => { try { return s && s.exists() ? JSON.parse(s.data().data || "null") : null; } catch { return null; } };
  const redirect = AU.getRedirectResult(auth).catch(e => e); // finishes a Google sign-in that went through a redirect

  return {
    redirect,
    onAuth(cb) {
      return AU.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email || "", name: u.displayName || "" } : null));
    },
    async signInGoogle() {
      const p = new AU.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      try { await AU.signInWithPopup(auth, p); }
      catch (e) {
        // installed app on iPhone and some in-app browsers can't open the Google window: go through a redirect instead
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return AU.signInWithRedirect(auth, p);
        throw e;
      }
    },
    async signUpEmail(email, pass) {
      const c = await AU.createUserWithEmailAndPassword(auth, email, pass);
      try { await AU.sendEmailVerification(c.user); } catch { /* not critical */ }
    },
    signInEmail: (email, pass) => AU.signInWithEmailAndPassword(auth, email, pass),
    resetPassword: email => AU.sendPasswordResetEmail(auth, email),
    signOut: () => AU.signOut(auth),
    // short-lived sign-in token for the Ear & Pen server (refreshed automatically; force = get a fresh one)
    token: (force = false) => auth.currentUser ? auth.currentUser.getIdToken(force) : Promise.resolve(null),
    async load() {
      return parse(await FS.getDoc(ref()));
    },
    save(obj) {
      return FS.setDoc(ref(), { data: JSON.stringify(obj), ts: Date.now(), v: obj.v || 1 });
    },
    watch(cb) {
      return FS.onSnapshot(ref(), s => { if (!s.metadata.hasPendingWrites) cb(parse(s)); }, () => {});
    },
  };
}
