import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC3D7LJg3E5SdlC-JrRyUjNKpwTHd37PLk",
  authDomain: "travelapp-f7ff4.firebaseapp.com",
  projectId: "travelapp-f7ff4",
  storageBucket: "travelapp-f7ff4.firebasestorage.app",
  messagingSenderId: "1093173844964",
  appId: "1:1093173844964:web:991c37c1fdfe50853705f1"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);