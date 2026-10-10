// ─────────────────────────────────────────────────────────────
// 1) Pega aquí la configuración de tu proyecto de Firebase
//    (Consola de Firebase → Configuración del proyecto → Tus apps → Web)
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyCAZ5zeEQrRMRa-ATz3EZtt_AKbZ0HpSjk",
  authDomain: "recursos-para-clases.firebaseapp.com",
  databaseURL: "https://recursos-para-clases-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "recursos-para-clases",
  appId: "1:228868139413:web:64ad459a100a3f259f6e9c"
};

// 2) Nombre que verá el alumnado y el profesorado
export const NOMBRE_APP = "Clase en directo";

// 3) Dominio de las cuentas corporativas del alumnado.
//    Solo podrán entrar en clase cuentas de este dominio.
export const DOMINIO_ALUMNADO = "nervion.salesianas.org";
