// Service worker mínimo: permite instalar a app no telemóvel. Sem cache offline
// (os dados mudam com frequência e devem vir sempre do servidor).
self.addEventListener("fetch", () => {});
