const elements = {
  appShell: document.querySelector("#app-shell"),
  cancelTitle: document.querySelector("#cancel-title"),
  closeSidebar: document.querySelector("#close-sidebar"),
  composerForm: document.querySelector("#composer-form"),
  conversationList: document.querySelector("#conversation-list"),
  currentTitle: document.querySelector("#current-title"),
  deleteChat: document.querySelector("#delete-chat"),
  editTitle: document.querySelector("#edit-title"),
  emptyState: document.querySelector("#empty-state"),
  exportAll: document.querySelector("#export-all"),
  loginError: document.querySelector("#login-error"),
  loginForm: document.querySelector("#login-form"),
  loginView: document.querySelector("#login-view"),
  logout: document.querySelector("#logout"),
  messageInput: document.querySelector("#message-input"),
  messages: document.querySelector("#messages"),
  newChat: document.querySelector("#new-chat"),
  openSidebar: document.querySelector("#open-sidebar"),
  password: document.querySelector("#password"),
  remember: document.querySelector("#remember"),
  sendButton: document.querySelector("#send-button"),
  sidebar: document.querySelector("#sidebar"),
  sidebarScrim: document.querySelector("#sidebar-scrim"),
  titleDialog: document.querySelector("#title-dialog"),
  titleForm: document.querySelector("#title-form"),
  titleInput: document.querySelector("#title-input"),
  toast: document.querySelector("#toast"),
};

const state = {
  conversations: [],
  current: null,
  sending: false,
};

let toastTimer;

async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers });

  if (response.status === 401 && path !== "/api/login") {
    showLogin();
    throw new Error("Please log in again.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Something went wrong.");
  }

  if (response.status === 204) return null;
  return response.json();
}

function showLogin() {
  state.current = null;
  elements.appShell.hidden = true;
  elements.loginView.hidden = false;
  elements.password.focus();
}

function showApp() {
  elements.loginView.hidden = true;
  elements.appShell.hidden = false;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3500);
}

function closeSidebar() {
  elements.sidebar.classList.remove("open");
  elements.sidebarScrim.classList.remove("visible");
}

function openSidebar() {
  elements.sidebar.classList.add("open");
  elements.sidebarScrim.classList.add("visible");
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(new Date(value).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function renderConversationList() {
  elements.conversationList.replaceChildren();
  for (const conversation of state.conversations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `conversation-item${state.current?.id === conversation.id ? " active" : ""}`;
    button.dataset.id = conversation.id;

    const title = document.createElement("span");
    title.className = "conversation-title";
    title.textContent = conversation.title;

    const date = document.createElement("span");
    date.className = "conversation-date";
    date.textContent = `${formatDate(conversation.updated_at)} · ${conversation.message_count} message${conversation.message_count === 1 ? "" : "s"}`;
    button.append(title, date);
    elements.conversationList.append(button);
  }
}

function createMessageElement(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  if (message.role === "assistant" && typeof message.rendered_content === "string") {
    bubble.innerHTML = message.rendered_content;
  } else {
    bubble.textContent = message.content;
  }

  const meta = document.createElement("time");
  meta.className = "message-meta";
  meta.dateTime = message.timestamp;
  meta.textContent = `${message.role === "user" ? "You" : "Assistant"} · ${formatTime(message.timestamp)}`;
  article.append(bubble, meta);
  return article;
}

function renderCurrentConversation({ typing = false } = {}) {
  elements.currentTitle.textContent = state.current?.title || "New chat";
  elements.deleteChat.disabled = !state.current;
  elements.editTitle.disabled = !state.current;
  elements.messages.replaceChildren();

  if (!state.current || state.current.messages.length === 0) {
    elements.messages.append(elements.emptyState);
    return;
  }

  const list = document.createElement("div");
  list.className = "message-list";
  for (const message of state.current.messages) list.append(createMessageElement(message));
  if (typing) {
    const indicator = document.createElement("div");
    indicator.className = "message assistant typing";
    indicator.textContent = "Thinking…";
    list.append(indicator);
  }
  elements.messages.append(list);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

async function loadConversations(selectId = state.current?.id) {
  const payload = await api("/api/conversations");
  state.conversations = payload.conversations;
  renderConversationList();

  const nextId = selectId && state.conversations.some(({ id }) => id === selectId)
    ? selectId
    : state.conversations[0]?.id;
  if (nextId) await selectConversation(nextId);
  else {
    state.current = null;
    renderCurrentConversation();
  }
}

async function selectConversation(id, rerenderList = true) {
  const payload = await api(`/api/conversations/${encodeURIComponent(id)}`);
  state.current = payload.conversation;
  renderCurrentConversation();
  if (rerenderList) renderConversationList();
  closeSidebar();
}

async function createConversation() {
  const payload = await api("/api/conversations", { method: "POST", body: "{}" });
  await loadConversations(payload.conversation.id);
  elements.messageInput.focus();
}

function resizeComposer() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 150)}px`;
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  elements.loginError.textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: elements.password.value, remember: elements.remember.checked }),
    });
    elements.password.value = "";
    showApp();
    await loadConversations();
  } catch (error) {
    elements.loginError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

elements.conversationList.addEventListener("click", (event) => {
  const item = event.target.closest(".conversation-item");
  if (item) selectConversation(item.dataset.id).catch((error) => showToast(error.message));
});

elements.newChat.addEventListener("click", () => createConversation().catch((error) => showToast(error.message)));
elements.openSidebar.addEventListener("click", openSidebar);
elements.closeSidebar.addEventListener("click", closeSidebar);
elements.sidebarScrim.addEventListener("click", closeSidebar);
elements.messageInput.addEventListener("input", resizeComposer);
elements.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    elements.composerForm.requestSubmit();
  }
});

elements.composerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = elements.messageInput.value;
  if (!content.trim() || state.sending) return;

  state.sending = true;
  elements.sendButton.disabled = true;
  elements.messageInput.value = "";
  resizeComposer();

  try {
    if (!state.current) await createConversation();
    state.current.messages.push({ role: "user", content, timestamp: new Date().toISOString() });
    renderCurrentConversation({ typing: true });
    const payload = await api(`/api/conversations/${encodeURIComponent(state.current.id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    state.current = payload.conversation;
    renderCurrentConversation();
    await loadConversations(state.current.id);
  } catch (error) {
    showToast(error.message);
    if (state.current) await selectConversation(state.current.id).catch(() => {});
  } finally {
    state.sending = false;
    elements.sendButton.disabled = false;
    elements.messageInput.focus();
  }
});

elements.editTitle.addEventListener("click", () => {
  if (!state.current) return;
  elements.titleInput.value = state.current.title;
  elements.titleDialog.showModal();
  elements.titleInput.select();
});

elements.cancelTitle.addEventListener("click", () => elements.titleDialog.close());
elements.titleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = elements.titleInput.value.trim();
  if (!title || !state.current) return;
  try {
    await api(`/api/conversations/${encodeURIComponent(state.current.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    elements.titleDialog.close();
    await loadConversations(state.current.id);
  } catch (error) {
    showToast(error.message);
  }
});

elements.deleteChat.addEventListener("click", async () => {
  if (!state.current || !window.confirm(`Delete “${state.current.title}”? This cannot be undone.`)) return;
  try {
    await api(`/api/conversations/${encodeURIComponent(state.current.id)}`, { method: "DELETE" });
    state.current = null;
    await loadConversations();
    showToast("Conversation deleted.");
  } catch (error) {
    showToast(error.message);
  }
});

elements.exportAll.addEventListener("click", () => {
  window.location.assign("/api/export");
  closeSidebar();
});

elements.logout.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  showLogin();
});

async function initialize() {
  try {
    await api("/api/session");
    showApp();
    await loadConversations();
  } catch {
    showLogin();
  }
}

initialize();
