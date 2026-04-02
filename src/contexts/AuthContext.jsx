import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch custom role from users collection
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists() && userDoc.data().role) {
            setUserRole(userDoc.data().role);
          } else {
            console.warn("No role found for user ID. Auto-provisioning...");
            // If it's the very first user, or their email contains "damien", make them admin.
            // Otherwise, set to unauthorized pending admin approval.
            const usersSnap = await getDocs(collection(db, "users"));
            const isAdminEmail = user.email && user.email.toLowerCase().includes("damien");
            const fallbackRole = (usersSnap.empty || isAdminEmail) ? "admin" : "unauthorized";
            
            setUserRole(fallbackRole);

            // Auto-create their document so they show up in the Team tab
            try {
              await setDoc(doc(db, "users", user.uid), {
                name: user.displayName || user.email?.split("@")[0] || "Unknown",
                email: user.email || "",
                role: fallbackRole,
                initials: (user.displayName || user.email?.split("@")[0] || "U").slice(0, 2).toUpperCase()
              });
            } catch (err) {
              console.error("Failed to auto-create profile doc", err);
            }
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setUserRole("unauthorized");
        }
      } else {
        setUserRole(null);
      }
      setTimeout(() => setLoading(false), 0);
    });

    return unsubscribe;
  }, []);

  const isAdmin = userRole === "admin";
  const isAC = userRole === "asset_controller";
  const isForeman = userRole === "foreman";

  const value = {
    currentUser,
    userRole,
    // Unified capability flags
    canEdit: isAdmin || isAC || isForeman,
    isAdmin,
    
    // Granular Permissions
    canAddTool: isAdmin || isAC || isForeman,
    canEditTool: isAdmin || isAC || isForeman,
    canDeleteTool: isAdmin || isAC,
    canCheckOut: isAdmin || isAC || isForeman,
    canCheckIn: isAdmin || isAC,
    canLogRepair: isAdmin || isAC || isForeman,
    canUpdateRepair: isAdmin || isAC,
    canSeeReports: isAdmin || isAC,
    canSeeFinancials: isAdmin || isAC,
    canManageSystem: isAdmin || isAC,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
