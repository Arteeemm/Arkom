const socket = io({ auth: { token: localStorage.getItem("token") } });
let currentChatId = null;
let currentUserId = null;

const token = localStorage.getItem("token");
if (!token) window.location.href = "/index.html";

const storedUser = localStorage.getItem("user");
if (storedUser) currentUserId = JSON.parse(storedUser).id;

// ✅ Единая заглушка для всех пользователей без фото
const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23E5E7EB' width='100' height='100'/%3E%3Ccircle cx='50' cy='35' r='15' fill='%239CA3AF'/%3E%3Cellipse cx='50' cy='75' rx='25' ry='20' fill='%239CA3AF'/%3E%3C/svg%3E";

function openSidebar() {
  document.getElementById("sidebar").classList.remove("-translate-x-full");
  document.getElementById("sidebarOverlay").classList.remove("hidden");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.add("-translate-x-full");
  document.getElementById("sidebarOverlay").classList.add("hidden");
}

async function loadChats() {
  try {
    const res = await fetch("/api/chats", { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error("Не удалось загрузить чаты");
    const chats = await res.json();
    const container = document.getElementById("chatList");
    container.innerHTML = "";
    if (chats.length === 0) {
      container.innerHTML = '<div class="p-6 text-center text-gray-500">У вас пока нет чатов</div>';
      return;
    }
    chats.forEach(chat => {
      const other = chat.users.find(u => u._id !== currentUserId) || chat.users[0];
      if (!other) return;
      const isActive = chat._id === currentChatId;
      const lastMsg = chat.lastMessage?.text || "Нет сообщений";
      const displayName = other.displayName || other.username;
      // ✅ Использовать DEFAULT_AVATAR если нет фото
      const avatar = other.avatar || DEFAULT_AVATAR;
      const div = document.createElement("div");
      div.className = `p-4 border-b hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition ${isActive ? "bg-blue-50" : ""}`;
      div.innerHTML = `
        <div class="relative">
          <img src="${avatar}" class="w-12 h-12 rounded-full object-cover border-2 border-white">
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">${displayName}</div>
          <div class="text-sm text-gray-500 truncate">${lastMsg}</div>
        </div>
        <div class="text-xs text-gray-400">
          ${chat.lastMessage ? new Date(chat.lastMessage.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}
        </div>
      `;
      div.onclick = () => {
        openChat(chat._id, displayName, avatar);
        if (window.innerWidth < 768) closeSidebar();
      };
      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
  }
}

async function openChat(chatId, title, avatar = null) {
  currentChatId = chatId;
  showChatUI();
  
  document.getElementById("chatTitle").textContent = title;
  document.getElementById("chatTitleMobile").textContent = title;
  // ✅ Использовать DEFAULT_AVATAR если avatar пуст
  const avatarSrc = avatar || DEFAULT_AVATAR;
  document.getElementById("chatAvatar").src = avatarSrc;
  document.getElementById("chatAvatarMobile").src = avatarSrc;
  
  try {
    const res = await fetch(`/api/messages/${chatId}`, { headers: { "Authorization": `Bearer ${token}` } });
    const messages = await res.json();
    const container = document.getElementById("messages");
    container.innerHTML = "";
    messages.forEach(msg => addMessage(msg));
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("Ошибка загрузки сообщений", err);
  }
}

function addMessage(msg) {
  const container = document.getElementById("messages");
  const isOwn = msg.sender._id === currentUserId;
  const bubble = document.createElement("div");
  bubble.className = `flex ${isOwn ? "justify-end" : "justify-start"}`;
  bubble.innerHTML = `
    <div class="max-w-[75%] px-4 py-3 rounded-2xl shadow-sm ${isOwn ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-gray-200 rounded-bl-none"}">
      ${!isOwn ? `<div class="text-xs text-gray-500 mb-1">${msg.sender.username}</div>` : ""}
      <div>${msg.text}</div>
      <div class="text-xs opacity-70 mt-1 text-right">${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    </div>
  `;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  socket.emit("sendMessage", { chatId: currentChatId, text });
  input.value = "";
}

socket.on("newMessage", (msg) => {
  if (msg.chat.toString() === currentChatId) addMessage(msg);
  loadChats();
});

let searchTimer;
document.getElementById("searchInput").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const query = e.target.value.trim();
    if (query.length < 2) {
      loadChats();
      return;
    }
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { headers: { "Authorization": `Bearer ${token}` } });
      const users = await res.json();
      const container = document.getElementById("chatList");
      container.innerHTML = "";
      if (users.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-gray-500">Пользователи не найдены</div>';
        return;
      }
      users.forEach(user => {
        const displayName = user.displayName || user.username;
        // ✅ Использовать DEFAULT_AVATAR если нет фото
        const avatar = user.avatar || DEFAULT_AVATAR;
        const div = document.createElement("div");
        div.className = "p-4 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b";
        div.innerHTML = `
          <img src="${avatar}" class="w-11 h-11 rounded-full object-cover">
          <div class="font-medium">${displayName}</div>
        `;
        div.onclick = async () => {
          try {
            const resp = await fetch("/api/chat/start", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
              body: JSON.stringify({ otherUserId: user._id })
            });
            const chat = await resp.json();
            openChat(chat._id, displayName, avatar);
            loadChats();
            if (window.innerWidth < 768) closeSidebar();
          } catch (err) {
            console.error("Ошибка создания чата", err);
          }
        };
        container.appendChild(div);
      });
    } catch (err) {
      console.error(err);
    }
  }, 350);
});

socket.on("connect", () => {
  socket.emit("joinChats");
  loadChats();
});
