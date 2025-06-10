// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { signOut } from "firebase/auth";
import { doc, getFirestore, setDoc } from "firebase/firestore";

import toast from "react-hot-toast";
import chatStore from "../mobexStore/chatStore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app)
const db = getFirestore(app)

const signUpUser = async (username, email, password, profilePic) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const useref = doc(db, "users", user.uid);
    await setDoc(useref, {
      username: username.toLowerCase(),
      email: email,
      profilePic: profilePic,
      id: user.uid,
      bio: "Hey there! I am using Chat App",
      lastSeen: Date.now(),
    });

    const userChatRef = doc(db, "userChats", user.uid);

    await setDoc(userChatRef, {
      chatData: []
    })

    return true

  } catch (error) {
    console.error("Error signing up:", error);
    toast.error("Error signing up: " + error.code.split('/')[1].split('-').join(' '));
    return false;
  }
}

export const LogInUser = async (email, password) => {
  try {
    if (!email || !password) {
      toast.error("Please fill all the fields");
      return false;
    }
    const res = await signInWithEmailAndPassword(auth, email, password);
    return res;
  } catch (error) {
    console.error("Error logging in:", error);
    toast.error("Error logging in: " + error.code.split('/')[1].split('-').join(' '));
    return false;
  }
}

export const LogOutUser = async () => {
  try {
    await signOut(auth);
    chatStore.logoutCleanup()
    toast.success("Logged out successfully");
    return true;
  } catch (error) {
    console.error("Error logging out:", error);
    toast.error("Error logging out: " + error.code.split('/')[1].split('-').join(' '));
  }
}

export { signUpUser, auth, db }