(function(){
  "use strict";

  const OBTAIN_LABEL = {
    Free: "Free",
    Shop: "Shop",
    BattlePass: "Battle Pass",
    PlayerLevel: "Player Level",
    Bundle: "Bundle"
  };

  const byName = new Map(KITS.map(k => [k.name.toLowerCase(), k]));
  const names = KITS.map(k => k.name).sort((a,b)=>a.localeCompare(b));

  // ---------- date / seed helpers ----------
  function todayStr(){
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }
  function hashStr(str){
    let h = 0;
    for (let i=0;i<str.length;i++){
      h = (Math.imul(31,h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
  function dailyTarget(){
    const idx = hashStr(todayStr()) % KITS.length;
    return KITS[idx];
  }
  function randomTarget(exclude){
    let t;
    do { t = KITS[Math.floor(Math.random()*KITS.length)]; }
    while (exclude && t.name === exclude);
    return t;
  }

  // ---------- storage ----------
  const LS = {
    get(k, fallback){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }catch(e){ return fallback; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  };

  // ---------- state ----------
  let state = {
    mode: "daily",
    target: null,
    guesses: [],   // array of kit objects
    over: false,
    won: false
  };

  function loadDaily(){
    const today = todayStr();
    const saved = LS.get("kitdle_daily", null);
    if (saved && saved.date === today){
      state.target = byName.get(saved.targetName.toLowerCase());
      state.guesses = saved.guesses.map(n => byName.get(n.toLowerCase()));
      state.over = saved.over;
      state.won = saved.won;
    } else {
      state.target = dailyTarget();
      state.guesses = [];
      state.over = false;
      state.won = false;
      persistDaily();
    }
  }
  function persistDaily(){
    LS.set("kitdle_daily", {
      date: todayStr(),
      targetName: state.target.name,
      guesses: state.guesses.map(g=>g.name),
      over: state.over,
      won: state.won
    });
  }

  function startUnlimited(){
    state.target = randomTarget();
    state.guesses = [];
    state.over = false;
    state.won = false;
  }

  function getStreak(){ return LS.get("kitdle_streak", 0); }
  function bumpStreak(won){
    const today = todayStr();
    const last = LS.get("kitdle_streak_date", null);
    let streak = getStreak();
    if (won){
      if (last !== today){
        streak = streak + 1;
        LS.set("kitdle_streak", streak);
        LS.set("kitdle_streak_date", today);
      }
    } else {
      streak = 0;
      LS.set("kitdle_streak", 0);
    }
  }

  // ---------- DOM refs ----------
  const $ = sel => document.querySelector(sel);
  const input = $("#guessInput");
  const guessBtn = $("#guessBtn");
  const suggestionsEl = $("#suggestions");
  const rowsEl = $("#rows");
  const attemptsLabel = $("#attemptsLabel");
  const streakLabel = $("#streakLabel");
  const winPanel = $("#winPanel");
  const winTitle = $("#winTitle");
  const winSub = $("#winSub");
  const shareBtn = $("#shareBtn");
  const newGameBtn = $("#newGameBtn");
  const nextDailyEl = $("#nextDaily");
  const intro = $("#intro");

  // ---------- comparison ----------
  function cellResult(guess, target, field){
    if (field === "class"){
      return { grade: guess.class === target.class ? "gold" : "stone", text: guess.class };
    }
    if (field === "obtain"){
      return { grade: guess.obtain === target.obtain ? "gold" : "stone", text: OBTAIN_LABEL[guess.obtain] };
    }
    if (field === "firstLetter"){
      return { grade: guess.firstLetter === target.firstLetter ? "gold" : "stone", text: guess.firstLetter };
    }
    if (field === "length"){
      const diff = guess.length - target.length;
      let grade;
      if (diff === 0) grade = "gold";
      else if (Math.abs(diff) <= 2) grade = "silver";
      else grade = "stone";
      const arrow = diff === 0 ? "" : (diff < 0 ? " ↑" : " ↓");
      return { grade, text: guess.length + arrow };
    }
    if (field === "words"){
      const diff = guess.words - target.words;
      const grade = diff === 0 ? "gold" : "stone";
      const arrow = diff === 0 ? "" : (diff < 0 ? " ↑" : " ↓");
      return { grade, text: guess.words + arrow };
    }
  }

  function renderRows(){
    rowsEl.innerHTML = "";
    state.guesses.forEach(g => {
      const row = document.createElement("div");
      row.className = "row";
      const kitCell = document.createElement("div");
      kitCell.className = "cell cell-kit";
      kitCell.textContent = g.name;
      row.appendChild(kitCell);

      ["class","obtain","firstLetter","length","words"].forEach(field=>{
        const res = cellResult(g, state.target, field);
        const cell = document.createElement("div");
        cell.className = "cell " + res.grade;
        cell.textContent = res.text;
        row.appendChild(cell);
      });
      rowsEl.appendChild(row);
    });
    attemptsLabel.textContent = state.guesses.length + (state.guesses.length===1 ? " guess" : " guesses");
    streakLabel.textContent = "🔥 streak: " + getStreak();
  }

  function showWin(){
    winPanel.classList.remove("hidden");
    winTitle.textContent = state.won ? "BED BROKEN!" : "BED SURVIVED";
    winSub.textContent = state.won
      ? `You found ${state.target.name} in ${state.guesses.length} ${state.guesses.length===1?"guess":"guesses"}.`
      : `The kit was ${state.target.name}.`;
    if (state.mode === "unlimited"){
      newGameBtn.classList.remove("hidden");
      nextDailyEl.classList.add("hidden");
    } else {
      newGameBtn.classList.add("hidden");
      nextDailyEl.classList.remove("hidden");
      nextDailyEl.textContent = "Come back tomorrow for a new daily kit.";
    }
    input.disabled = true;
    guessBtn.disabled = true;
  }
  function hideWin(){
    winPanel.classList.add("hidden");
    input.disabled = false;
    guessBtn.disabled = false;
  }

  function submitGuess(name){
    const kit = byName.get(name.trim().toLowerCase());
    if (!kit) return;
    if (state.over) return;
    if (state.guesses.some(g=>g.name === kit.name)) { input.value=""; return; }

    state.guesses.push(kit);
    const won = kit.name === state.target.name;
    if (won){
      state.over = true;
      state.won = true;
    }
    if (state.mode === "daily") persistDaily();
    renderRows();
    input.value = "";
    suggestionsEl.classList.remove("show");

    if (won){
      if (state.mode === "daily") bumpStreak(true);
      showWin();
    }
  }

  // ---------- autocomplete ----------
  function renderSuggestions(query){
    const q = query.trim().toLowerCase();
    if (!q){ suggestionsEl.classList.remove("show"); suggestionsEl.innerHTML=""; return; }
    const guessedNames = new Set(state.guesses.map(g=>g.name));
    const matches = names.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length){ suggestionsEl.classList.remove("show"); suggestionsEl.innerHTML=""; return; }
    suggestionsEl.innerHTML = "";
    matches.forEach(n=>{
      const kit = byName.get(n.toLowerCase());
      const item = document.createElement("div");
      item.className = "suggestion-item" + (guessedNames.has(n) ? " guessed" : "");
      item.innerHTML = `<span>${n}</span><span class="tag">${kit.class}</span>`;
      item.addEventListener("click", ()=> submitGuess(n));
      suggestionsEl.appendChild(item);
    });
    suggestionsEl.classList.add("show");
  }

  input.addEventListener("input", e => renderSuggestions(e.target.value));
  input.addEventListener("keydown", e=>{
    if (e.key === "Enter"){
      const exact = names.find(n=>n.toLowerCase() === input.value.trim().toLowerCase());
      if (exact) submitGuess(exact);
    }
  });
  guessBtn.addEventListener("click", ()=>{
    const exact = names.find(n=>n.toLowerCase() === input.value.trim().toLowerCase());
    if (exact) submitGuess(exact);
  });
  document.addEventListener("click", e=>{
    if (!e.target.closest(".autocomplete-wrap")) suggestionsEl.classList.remove("show");
  });

  // ---------- share ----------
  function buildShareText(){
    const n = state.guesses.length;
    const lines = state.guesses.map(g=>{
      return ["class","obtain","firstLetter","length","words"].map(f=>{
        const r = cellResult(g, state.target, f);
        return r.grade === "gold" ? "🟨" : r.grade === "silver" ? "⬜" : "🟦";
      }).join("");
    });
    const header = state.mode === "daily"
      ? `KITDLE ${todayStr()} — ${state.won ? n : "X"}/∞`
      : `KITDLE (Unlimited) — ${state.won ? n : "X"} guesses`;
    return header + "\n" + lines.join("\n");
  }
  shareBtn.addEventListener("click", ()=>{
    const text = buildShareText();
    if (navigator.clipboard){
      navigator.clipboard.writeText(text).then(()=>{
        shareBtn.textContent = "Copied!";
        setTimeout(()=> shareBtn.textContent = "Copy Result", 1500);
      });
    }
  });

  newGameBtn.addEventListener("click", ()=>{
    startUnlimited();
    hideWin();
    renderRows();
  });

  // ---------- mode switching ----------
  document.querySelectorAll(".mode-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".mode-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      state.mode = btn.dataset.mode;
      hideWin();
      if (state.mode === "daily"){
        loadDaily();
        intro.querySelector("p").innerHTML = "<strong>Guess today's BedWars kit.</strong> Every guess compares Class, Obtain Method, First Letter, Name Length and Word Count — get all five gold to win. Same kit for everyone, every day.";
      } else {
        startUnlimited();
        intro.querySelector("p").innerHTML = "<strong>Unlimited mode.</strong> Random kit every round — guess as many times as you like, then hit Play Again.";
      }
      renderRows();
      if (state.over) showWin();
    });
  });

  // ---------- help modal ----------
  $("#helpBtn").addEventListener("click", ()=> $("#helpModal").classList.remove("hidden"));
  $("#closeHelp").addEventListener("click", ()=> $("#helpModal").classList.add("hidden"));
  $("#helpModal").addEventListener("click", e=>{ if (e.target.id === "helpModal") $("#helpModal").classList.add("hidden"); });

  // ---------- init ----------
  loadDaily();
  renderRows();
  if (state.over) showWin();
})();
