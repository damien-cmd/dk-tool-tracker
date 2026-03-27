import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateEmail, updatePassword, deleteUser, signOut as signOutSecondary } from "firebase/auth";
import { db, secondaryAuth } from "../firebase";

const INIT_USERS = [
  { id: "u1", name: "Damien Kasselman", role: "admin",            initials: "DK" },
  { id: "u2", name: "Levona",           role: "asset_controller", initials: "LV" },
  { id: "u3", name: "Ruan",             role: "foreman",          initials: "RU" },
  { id: "u4", name: "Carlos",           role: "foreman",          initials: "CA" },
  { id: "u5", name: "Ashwin",           role: "foreman",          initials: "AS" },
  { id: "u6", name: "Thabo",            role: "foreman",          initials: "TB" },
];
const INIT_SITES = [
  { id: "s1", name: "Constantia Residence",    address: "Constantia, Cape Town" },
  { id: "s2", name: "Green Point Development", address: "Green Point, Cape Town" },
  { id: "s3", name: "Brackenfell School",      address: "Brackenfell, Cape Town" },
  { id: "s4", name: "Bellville Industrial",    address: "Bellville, Cape Town" },
  { id: "s5", name: "Camps Bay Villa",         address: "Camps Bay, Cape Town" },
];
const INIT_CATS = ["Power Tools","Hand Tools","Measuring","Safety","Machinery","Landscaping","Paving","Electrical"];

export function useLiveTracking(userId) {
  const [tools, setToolsState] = useState([]);
  const [checkouts, setCheckoutsState] = useState([]);
  const [repairs, setRepairsState] = useState([]);
  const [categories, setCategoriesState] = useState(INIT_CATS);
  const [users, setUsersState] = useState(INIT_USERS);
  const [sites, setSitesState] = useState(INIT_SITES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ---------------------------------------------------------
    // CRITICAL: Await valid authentication token before syncing
    // ---------------------------------------------------------
    if (!userId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    let unsubs = [];
    
    unsubs.push(onSnapshot(collection(db, "tools"), (snap) => {
      setToolsState(snap.docs.map(doc => doc.data()));
    }, (err) => console.error("Tools sync failed:", err)));

    unsubs.push(onSnapshot(collection(db, "checkouts"), (snap) => {
      setCheckoutsState(snap.docs.map(doc => doc.data()));
    }));

    unsubs.push(onSnapshot(collection(db, "repairs"), (snap) => {
      setRepairsState(snap.docs.map(doc => doc.data()));
    }));

    unsubs.push(onSnapshot(doc(db, "config", "categories"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().items) {
        setCategoriesState(docSnap.data().items);
      }
    }));
    
    unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
      const loadedUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsersState(loadedUsers.length > 0 ? loadedUsers : INIT_USERS);
    }));

    unsubs.push(onSnapshot(collection(db, "sites"), (snap) => {
      const loadedSites = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSitesState(loadedSites.length > 0 ? loadedSites : INIT_SITES);
    }));

    // Grant 500ms safety buffer for initial payload delivery
    const to = setTimeout(() => setLoading(false), 500);

    return () => {
      clearTimeout(to);
      unsubs.forEach(fn => fn());
    };
  }, [userId]);

  // Write wrappers
  const saveTool = async (data) => {
    const id = data.id || `T${String(Date.now()).slice(-4)}`;
    const payload = data.id ? data : { ...data, id, status: data.status || "available" };
    await setDoc(doc(db, "tools", id), payload);
  };

  const importTools = async (toolsArray) => {
    const batch = writeBatch(db);
    toolsArray.forEach((tool, index) => {
      const id = tool.id || `T${String(Date.now()).slice(-4)}${Math.floor(Math.random()*10000)}${index}`;
      batch.set(doc(db, "tools", id), { ...tool, id }, { merge: true });
    });
    await batch.commit();
  };

  const removeTool = async (id) => {
    await deleteDoc(doc(db, "tools", id));
  };

  const checkoutTools = async (toolsSelected, assignment) => {
    const today = new Date().toISOString().split("T")[0];
    const uid = () => `id_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const newCOs = toolsSelected.map(toolId => ({ id:uid(), toolId, ...assignment, checkoutDate:today, returnDate:null }));
    
    const batch = writeBatch(db);
    newCOs.forEach(c => batch.set(doc(db, "checkouts", c.id), c));
    toolsSelected.forEach(toolId => batch.update(doc(db, "tools", toolId), { status: "checked_out" }));
    await batch.commit();
  };

  const checkinTools = async (checkoutIdsToReturn) => {
    const today = new Date().toISOString().split("T")[0];
    const toolIds = checkoutIdsToReturn.map(coId => checkouts.find(c=>c.id===coId)?.toolId).filter(Boolean);
    
    const batch = writeBatch(db);
    checkoutIdsToReturn.forEach(coId => batch.update(doc(db, "checkouts", coId), { returnDate: today }));
    toolIds.forEach(toolId => batch.update(doc(db, "tools", toolId), { status: "available" }));
    await batch.commit();
  };

  const logRepair = async (form) => {
    const uid = () => `id_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const newRepair = { id:uid(), ...form, estimatedCost:Number(form.estimatedCost)||0, status:"pending", actualCost:null, notes:"" };
    const batch = writeBatch(db);
    batch.set(doc(db, "repairs", newRepair.id), newRepair);
    batch.update(doc(db, "tools", form.toolId), { status: "in_repair" });
    await batch.commit();
  };

  const updateRepair = async (updated) => {
    const batch = writeBatch(db);
    batch.set(doc(db, "repairs", updated.id), updated);
    if (updated.status === "complete") {
      batch.update(doc(db, "tools", updated.toolId), { status: "available" });
    }
    await batch.commit();
  };

  const updateRepairStatus = async (id, status) => {
    const batch = writeBatch(db);
    batch.update(doc(db, "repairs", id), { status });
    if (status === "complete") {
      const r = repairs.find(r=>r.id===id);
      if (r) batch.update(doc(db, "tools", r.toolId), { status: "available" });
    }
    await batch.commit();
  };

  const saveCategories = async ({cats, renames, deleted}) => {
    let nextCats = [...cats];
    if (deleted.length > 0 && !nextCats.includes("Uncategorized")) {
      const needsUncat = tools.some(t => deleted.includes(t.category));
      if (needsUncat) nextCats.push("Uncategorized");
    }
    await setDoc(doc(db, "config", "categories"), { items: nextCats });
    
    if (Object.keys(renames).length > 0 || deleted.length > 0) {
      const batch = writeBatch(db);
      tools.forEach(t => {
        let newCat = t.category;
        if (deleted.includes(t.category)) newCat = "Uncategorized";
        else if (renames[t.category]) newCat = renames[t.category];
        if (newCat !== t.category) {
          batch.update(doc(db, "tools", t.id), { category: newCat });
        }
      });
      await batch.commit();
    }
  };

  const createTeamMember = async ({ email, password, name, role }) => {
    // Treat "email" as username if it doesn't contain an @ symbol
    const authEmail = email.includes("@") ? email : `${email}@dkpaving.app`;
    
    // 1. Create user in Firebase Auth using the secondary app
    const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);
    // 2. Clear secondary auth session
    await signOutSecondary(secondaryAuth);
    
    // 3. Write user details to Firestore 'users' collection
    const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    await setDoc(doc(db, "users", cred.user.uid), {
      name,
      email, // We store the raw string they typed
      password, // Store password to allow admin edits later
      role,
      initials
    });
  };

  const removeTeamMember = async (userId) => {
    const userDoc = users.find(u => u.id === userId);
    if (!userDoc) throw new Error("User not found.");

    if (userDoc.password) {
      // Try to delete their Firebase Auth account
      try {
        const authEmail = userDoc.email.includes("@") ? userDoc.email : `${userDoc.email}@dkpaving.app`;
        const cred = await signInWithEmailAndPassword(secondaryAuth, authEmail, userDoc.password);
        await deleteUser(cred.user);
      } catch (err) {
        console.error("Failed to delete auth user:", err);
      }
    }
    
    await deleteDoc(doc(db, "users", userId));
  };

  const updateTeamMember = async (userId, updates) => {
    const userDoc = users.find(u => u.id === userId);
    if (!userDoc) throw new Error("User not found.");

    const oldEmail = userDoc.email;
    const oldPassword = userDoc.password;

    if ((updates.email && updates.email !== oldEmail) || (updates.password && updates.password !== oldPassword)) {
      if (!oldPassword) {
        throw new Error("Cannot update login credentials for older profiles without saved passwords. Please delete and recreate this user.");
      }
      
      const authOldEmail = oldEmail.includes("@") ? oldEmail : `${oldEmail}@dkpaving.app`;
      const cred = await signInWithEmailAndPassword(secondaryAuth, authOldEmail, oldPassword);
      
      if (updates.email && updates.email !== oldEmail) {
        const authNewEmail = updates.email.includes("@") ? updates.email : `${updates.email}@dkpaving.app`;
        await updateEmail(cred.user, authNewEmail);
      }
      
      if (updates.password && updates.password !== oldPassword) {
        await updatePassword(cred.user, updates.password);
      }
      
      await signOutSecondary(secondaryAuth);
    }

    if (updates.name) {
      updates.initials = updates.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    }
    await setDoc(doc(db, "users", userId), updates, { merge: true });
  };

  const saveSite = async (site) => {
    const id = site.id || `S${String(Date.now()).slice(-4)}`;
    const payload = site.id ? site : { ...site, id };
    await setDoc(doc(db, "sites", id), payload);
  };

  const removeSite = async (id) => {
    await deleteDoc(doc(db, "sites", id));
  };

  return { tools, checkouts, repairs, categories, users, sites, loading, saveTool, importTools, removeTool, checkoutTools, checkinTools, logRepair, updateRepair, updateRepairStatus, saveCategories, createTeamMember, updateTeamMember, removeTeamMember, saveSite, removeSite };
}
