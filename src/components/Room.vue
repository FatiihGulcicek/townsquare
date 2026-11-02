<template>
  <div class="page room" :class="'phase-' + phase">
    <!-- top bar -->
    <div class="bar">
      <button class="code" @click="share" title="Davet et">
        {{ game.code }} <span>🔗</span>
      </button>
      <div class="phase-title">{{ phaseTitle }}</div>
      <div class="timer" :class="{ low: lowTime }" v-if="clock">
        {{ clock }}
      </div>
      <button class="icon" @click="$emit('settings')" aria-label="Ayarlar">
        ⚙️
      </button>
    </div>
    <VideoStrip />
    <div class="offline" v-if="game.status !== 'online'">
      {{
        game.status === "connecting"
          ? slowStart
            ? "Sunucu uyanıyor… ilk açılış bir dakika kadar sürebilir ☕"
            : "Bağlanıyor…"
          : "Bağlantı koptu, yeniden bağlanıyor…"
      }}
    </div>

    <div v-if="!s" class="card center muted">Odaya bağlanıyor…</div>

    <template v-else>
      <!-- my role -->
      <button
        class="my-role"
        v-if="myRole"
        @click="game.roleCardOpen = true"
        :class="myRole.team"
      >
        <span class="em">{{ myRole.emoji }}</span>
        <span>
          <b>{{ myRole.name }}</b>
          <small>{{
            s.me.alive ? "rolünü görmek için dokun" : "öldün · izliyorsun"
          }}</small>
        </span>
      </button>
      <div class="my-role st" v-if="isSt">
        <span class="em">🎙️</span>
        <span>
          <b>Anlatıcı sensin</b>
          <small>Her şeyi görüyorsun, oyunu sen ilerletirsin</small>
        </span>
      </div>

      <div class="card warn" v-if="s.me.muted">
        🔇 Susturuldun: sohbete yazamaz ve sesli konuşamazsın.
      </div>
      <div class="card warn" v-if="s.me.noVote && phase !== 'over'">
        🚫 Pasif kaldığın için bu oyunda oy hakkını kaybettin.
      </div>
      <div
        class="card warn soft"
        v-else-if="s.me.idle >= 2 && s.me.alive && phase !== 'over'"
      >
        ⚠️ Art arda pasif kaldın. Bir sonraki seçimini kaçırırsan oy hakkını
        kaybedersin.
      </div>

      <div class="card shot" v-if="s.shot && s.shot.mine">
        <h3>🏹 Son atışın!</h3>
        <p>Öldün ama yanında birini götürebilirsin. Kimi vuruyorsun?</p>
        <div class="grid pick">
          <button
            v-for="p in alivePlayers"
            :key="p.pid"
            class="tile"
            @click="shoot(p)"
          >
            <Avatar :name="p.name" :size="50" />
            <span class="name">{{ p.name }}</span>
            <span class="reacts"
              ><span v-for="r in reactsFor(p.pid)" :key="r.id" class="fly">{{
                r.emoji
              }}</span></span
            >
          </button>
        </div>
      </div>
      <div class="card lover" v-if="s.lover && phase !== 'over'">
        💘 Aşkın: <b>{{ s.lover.name }}</b
        >. Biriniz ölürse diğeri de kederden ölür.
      </div>

      <!-- ========== LOBBY ========== -->
      <template v-if="phase === 'lobby'">
        <div class="card" v-if="!s.me.seated && !isSt">
          <h3>Adın ne?</h3>
          <div class="inline">
            <input
              class="field"
              v-model="nameInput"
              maxlength="24"
              placeholder="Adın"
              @keyup.enter="sit"
            />
            <button class="btn primary" @click="sit">Otur</button>
          </div>
        </div>

        <div class="card center">
          <div class="muted">Oda kodu</div>
          <div class="big-code">{{ game.code }}</div>
          <div class="inline-btns">
            <button class="btn" @click="share">📨 Linki paylaş</button>
            <button class="btn" @click="showQr = true">📱 QR kod</button>
          </div>
          <details class="friends" v-if="friendList.length">
            <summary>
              👥 Birlikte oynadıkların ({{ friendList.length }})
            </summary>
            <div class="friend" v-for="f in friendList" :key="f.name">
              <Avatar :name="f.name" :size="34" />
              <span class="fn"
                >{{ f.name
                }}<small class="muted"> · {{ f.games }} oyun</small></span
              >
              <button class="btn small" @click="inviteFriend(f)">
                Davet et
              </button>
            </div>
          </details>
        </div>
        <div class="sheet-bg" v-if="showQr" @click.self="showQr = false">
          <div class="sheet center">
            <h3>Okut ve katıl</h3>
            <img class="qr" :src="qrData" alt="QR kod" />
            <div class="big-code">{{ game.code }}</div>
            <button class="btn ghost" @click="showQr = false">Kapat</button>
          </div>
        </div>

        <div class="card">
          <h3>Oyuncular ({{ s.players.length }}/{{ s.max }})</h3>
          <div class="grid">
            <div
              class="tile"
              v-for="p in s.players"
              :key="p.pid"
              @click="openMod(p)"
            >
              <span class="flags" v-if="p.muted">🔇</span>
              <Avatar
                :speaking="talk(p.pid)"
                :mic="inVoice(p.pid)"
                :name="p.name"
                :size="56"
                :online="p.online"
              />
              <span class="name">{{ p.name }}</span>
              <span class="reacts"
                ><span v-for="r in reactsFor(p.pid)" :key="r.id" class="fly">{{
                  r.emoji
                }}</span></span
              >
              <small v-if="p.pid === s.me.pid" class="muted">sen</small>
              <button
                v-if="s.me.isOwner && p.pid !== s.me.pid"
                class="x"
                @click.stop="kick(p)"
                aria-label="Çıkar"
              >
                ✕
              </button>
            </div>
          </div>
          <p v-if="!s.players.length" class="muted">Henüz kimse yok.</p>
          <div class="chips" v-if="s.setup">
            <template v-for="(count, role) in s.setup">
              <span class="chip" v-if="count && s.roles[role]" :key="role">
                {{ s.roles[role].emoji }}
                {{ count > 1 ? count + " " : "" }}{{ s.roles[role].name }}
              </span>
            </template>
            <span class="chip" v-if="s.settings.lovers">💘 Aşıklar</span>
          </div>
          <p v-else class="muted">En az {{ s.min }} oyuncu gerekiyor.</p>
        </div>

        <div class="card" v-if="s.me.isOwner">
          <h3>Oda ayarları</h3>
          <div class="settings">
            <label>
              Vampir sayısı
              <select
                :value="s.settings.vampires"
                @change="setting('vampires', $event.target.value, true)"
              >
                <option :value="0">Otomatik</option>
                <option v-for="m in [1, 2, 3, 4]" :key="m" :value="m">
                  {{ m }}
                </option>
              </select>
            </label>
            <template v-if="s.mode === 'auto'">
              <label>
                Gündüz süresi
                <select
                  :value="s.settings.dayMinutes"
                  @change="setting('dayMinutes', $event.target.value, true)"
                >
                  <option v-for="m in [2, 3, 5, 8, 12]" :key="m" :value="m">
                    {{ m }} dk
                  </option>
                </select>
              </label>
              <label>
                Gece süresi
                <select
                  :value="s.settings.nightSeconds"
                  @change="setting('nightSeconds', $event.target.value, true)"
                >
                  <option
                    v-for="m in [30, 45, 60, 90, 120]"
                    :key="m"
                    :value="m"
                  >
                    {{ m }} sn
                  </option>
                </select>
              </label>
            </template>
          </div>
          <h4 class="sub-h">Hazır ayarlar</h4>
          <div class="presets">
            <button
              v-for="p in presets"
              :key="p.id"
              class="preset"
              @click="applyPreset(p)"
            >
              <b>{{ p.emoji }} {{ p.name }}</b>
              <small>{{ p.desc }}</small>
            </button>
          </div>
          <h4 class="sub-h">Özel roller</h4>
          <div class="cat-chips role-chips">
            <button
              v-for="r in specialRoles"
              :key="r"
              class="cat"
              :class="{ on: s.settings[r] }"
              @click="setting(r, !s.settings[r])"
            >
              {{ s.roles[r].emoji }} {{ s.roles[r].name }}
            </button>
            <button
              class="cat"
              :class="{ on: s.settings.lovers }"
              @click="setting('lovers', !s.settings.lovers)"
            >
              💘 Aşıklar
            </button>
          </div>
          <p class="muted small role-help">
            Bir role dokununca açılır/kapanır. Ne işe yaradığını rol kartında
            görürsün.
          </p>
          <div class="toggles">
            <label class="toggle" v-for="t in toggles" :key="t.key">
              <span>
                {{ t.label }}
                <small class="muted">{{ t.hint }}</small>
              </span>
              <input
                type="checkbox"
                :checked="s.settings[t.key]"
                @change="setting(t.key, $event.target.checked)"
              />
            </label>
          </div>
          <div class="penalty-settings">
            <h4>🎲 Eğlence cezası</h4>
            <select
              class="full"
              :value="s.settings.penalty"
              @change="setting('penalty', $event.target.value)"
            >
              <option value="losers">Kaybeden herkese ayrı ceza</option>
              <option value="team">Kaybeden takıma ortak ceza</option>
              <option value="firstDead">Sadece ilk ölene</option>
              <option value="everyone">Herkese (eğlencesine)</option>
              <option value="off">Ceza yok</option>
            </select>
            <template v-if="s.settings.penalty !== 'off'">
              <div class="cat-chips">
                <button
                  v-for="(label, key) in s.penaltyCategories"
                  :key="key"
                  class="cat"
                  :class="{ on: s.settings.penaltyCats.includes(key) }"
                  @click="toggleCat(key)"
                >
                  {{ label }}
                </button>
              </div>
              <details class="custom">
                <summary>
                  Kendi cezalarınız ({{ s.settings.customPenalties.length }})
                </summary>
                <textarea
                  v-model="customText"
                  rows="4"
                  placeholder="Her satıra bir ceza yaz. Örn: Herkese çay demle."
                ></textarea>
                <button class="btn small" @click="saveCustom">Kaydet</button>
              </details>
            </template>
          </div>
          <p class="need" v-if="s.players.length < s.min">
            Başlamak için en az {{ s.min }} oyuncu lazım, şu an
            {{ s.players.length }} kişi var<template v-if="isSt">
              (anlatıcı oyuncu sayılmaz)</template
            >. Davet linkini paylaş ya da denemek için bot ekle.
          </p>
          <div class="bot-row">
            <button class="btn small" @click="act('addBot')">
              🤖 Bot ekle
            </button>
            <button class="btn small" v-if="hasBots" @click="act('removeBots')">
              Botları çıkar
            </button>
          </div>
          <button
            class="btn primary"
            :class="{ dim: s.players.length < s.min }"
            @click="start"
          >
            ▶️ Oyunu başlat
          </button>
        </div>
        <p class="center muted" v-else-if="s.me.seated">
          Oyunu kuran kişi herkes gelince başlatacak.
        </p>
      </template>

      <!-- watching a running game -->
      <div
        class="card center muted"
        v-else-if="!s.me.seated && !isSt && phase !== 'over'"
      >
        Oyun başlamış, şu an izleyicisin. Bir sonraki oyunda katılabilirsin.
      </div>

      <!-- ========== ROLES: draw a card ========== -->
      <div class="card center" v-if="phase === 'roles'">
        <h3 v-if="s.me.seated && !s.me.role">🃏 Bir kart seç</h3>
        <h3 v-else-if="s.me.seated">Kartın elinde, kimseye gösterme!</h3>
        <h3 v-else>Oyuncular kartlarını çekiyor</h3>
        <p class="muted small">
          {{ takenCount }}/{{ s.cards ? s.cards.length : 0 }} kart çekildi.
          <template v-if="s.mode === 'auto'">
            Süre dolunca kalan kartlar rastgele dağıtılır.</template
          >
        </p>
        <div class="deck" v-if="s.cards">
          <button
            v-for="c in s.cards"
            :key="c.i"
            class="play-card"
            :class="{ taken: c.taken, mine: c.mine, flipped: !!c.role }"
            :disabled="c.taken || !!s.me.role || !s.me.seated"
            @click="drawCard(c)"
          >
            <span class="inner">
              <span class="back">
                <span class="moon">🌙</span>
                <span class="who" v-if="c.taken && !c.role">{{ c.by }}</span>
              </span>
              <span class="front" v-if="c.role">
                <span class="em">{{ s.roles[c.role].emoji }}</span>
                <span class="rn">{{ s.roles[c.role].name }}</span>
                <span class="who" v-if="isSt && c.by">{{ c.by }}</span>
              </span>
            </span>
          </button>
        </div>
        <button class="btn primary" v-if="isSt" @click="act('next')">
          🌙 Geceyi başlat
        </button>
      </div>

      <!-- ========== NIGHT (player) ========== -->
      <div class="card night" v-if="phase === 'night' && s.night">
        <h3>{{ nightTitle }}</h3>
        <p>{{ nightHelp }}</p>
        <template v-if="s.night.action === 'cadi'">
          <p class="victim" v-if="s.night.victim">
            🧛 Vampirlerin şu anki hedefi:
            <b>{{ nameOf(s.night.victim) }}</b>
          </p>
          <p class="muted small" v-else>Vampirler henüz karar vermedi…</p>
          <label class="toggle potion" v-if="s.night.potions.heal">
            <span
              >🧪 Kurtarma iksirini kullan
              <small class="muted"
                >(bu gecenin kurbanını kurtarır, oyunda 1 kez)</small
              ></span
            >
            <input type="checkbox" v-model="witchHeal" />
          </label>
          <p class="muted small" v-else>🧪 Kurtarma iksirini kullandın.</p>
          <template v-if="s.night.potions.poison">
            <p class="small">
              ☠️ Zehir iksiri (oyunda 1 kez): istersen birini seç
            </p>
            <div class="grid pick">
              <button
                v-for="p in alivePlayers.filter((x) => x.pid !== s.me.pid)"
                :key="p.pid"
                class="tile"
                :class="{ selected: witchPoison === p.pid }"
                @click="witchPoison = witchPoison === p.pid ? null : p.pid"
              >
                <Avatar :name="p.name" :size="46" />
                <span class="name">{{ p.name }}</span>
                <span class="reacts"
                  ><span
                    v-for="r in reactsFor(p.pid)"
                    :key="r.id"
                    class="fly"
                    >{{ r.emoji }}</span
                  ></span
                >
              </button>
            </div>
          </template>
          <p class="muted small" v-else>☠️ Zehir iksirini kullandın.</p>
          <button class="btn primary" @click="witchDone">
            {{ s.night.done ? "✔ Kaydedildi (güncelle)" : "Kararımı ver" }}
          </button>
        </template>
        <div
          v-if="seerResult"
          class="seer-result"
          :class="{ bad: seerResult.vampir }"
        >
          {{
            seerResult.vampir
              ? "🧛 " + seerResult.name + " bir VAMPİR!"
              : "✅ " + seerResult.name + " vampir değil."
          }}
        </div>
        <div
          class="grid pick"
          v-if="
            !(s.night.action === 'gozcu' && s.night.done) &&
            s.night.action !== 'cadi'
          "
        >
          <button
            v-for="p in nightTargets"
            :key="p.pid"
            class="tile"
            :disabled="!p.allowed"
            :class="{ selected: s.night.target === p.pid }"
            @click="nightPick(p)"
          >
            <Avatar
              :speaking="talk(p.pid)"
              :mic="inVoice(p.pid)"
              :name="p.name"
              :size="54"
              :badge="p.badge"
            />
            <span class="name">{{ p.name }}</span>
            <span class="reacts"
              ><span v-for="r in reactsFor(p.pid)" :key="r.id" class="fly">{{
                r.emoji
              }}</span></span
            >
            <small v-if="p.note" class="muted">{{ p.note }}</small>
          </button>
        </div>
        <div v-if="s.night.team && s.night.team.length > 1" class="team">
          <b>Vampir ekibin:</b>
          <div v-for="v in s.night.team" :key="v.pid">
            {{ v.name }} →
            {{ v.target ? nameOf(v.target) : "henüz seçmedi" }}
          </div>
        </div>
        <p class="done" v-if="s.night.done && s.night.action !== 'gozcu'">
          ✔ Seçimin kaydedildi. Sabaha kadar değiştirebilirsin. Şimdi gözlerini
          kapat.
        </p>
      </div>
      <div
        class="card center muted"
        v-else-if="phase === 'night' && s.me.seated && !s.me.alive"
      >
        Öldün. Gece boyunca bekle. Ölüler kanalında sohbet edebilirsin.
      </div>

      <!-- ========== NIGHT (storyteller) ========== -->
      <div class="card" v-if="phase === 'night' && isSt">
        <h3>Gece seçimleri</h3>
        <ul class="st-night">
          <li>
            🧛 Vampirler: <b>{{ vampSummary || "henüz seçmediler" }}</b>
          </li>
          <li v-if="hasAlive('doktor')">
            🩺 Doktor korudu:
            <b>{{ nameOf(st.night.doktor) || "henüz seçmedi" }}</b>
          </li>
          <li v-if="hasAlive('gozcu')">
            👁️ Gözcü baktı:
            <b>{{ nameOf(st.night.gozcu) || "henüz seçmedi" }}</b>
          </li>
        </ul>
        <p :class="st.night.ready ? 'ok' : 'muted'">
          {{
            st.night.ready
              ? "✔ Herkes seçimini yaptı."
              : "Seçimler bekleniyor…"
          }}
        </p>
        <button class="btn primary" @click="act('next')">
          ☀️ Sabahı getir
        </button>
      </div>

      <!-- ========== DAY ========== -->
      <div class="card center defense" v-if="phase === 'defense' && s.runoff">
        <h3>🗣️ Savunma zamanı</h3>
        <div class="duo">
          <div v-for="pid in s.runoff.candidates" :key="pid">
            <Avatar :name="nameOf(pid)" :size="76" :speaking="talk(pid)" />
            <b>{{ nameOf(pid) }}</b>
          </div>
        </div>
        <p v-if="s.runoff.candidates.includes(s.me.pid)">
          Sen aday gösterildin! Kendini savun; sadece ikiniz konuşabilirsiniz.
        </p>
        <p class="muted" v-else>
          Dinleyin, sonra ikisi arasında oylama olacak.
        </p>
        <button class="btn primary" v-if="isSt" @click="act('next')">
          ⚖️ Son oylamayı başlat
        </button>
      </div>

      <template v-if="phase === 'day' || phase === 'runoff'">
        <div class="card banner" v-if="s.lastNight && phase === 'day'">
          <template v-if="s.lastNight.died.length">
            🩸 Bu gece <b>{{ s.lastNight.died[0].name }}</b> öldü<template
              v-if="s.lastNight.died[0].role"
            >
              ({{ roleName(s.lastNight.died[0].role) }})</template
            >.
          </template>
          <template v-else-if="s.lastNight.saved">
            🩺 Doktor bu gece birini kurtardı! Kimse ölmedi.
          </template>
          <template v-else>🌅 Bu gece kimse ölmedi.</template>
        </div>
        <div class="card">
          <h3>{{ phase === "runoff" ? "⚖️ Son oylama" : "Oylama" }}</h3>
          <p class="muted small" v-if="s.settings.secretVotes">
            🤫 Gizli oylama: kimin kime oy verdiği sayım bitene kadar görünmez.
          </p>
          <p class="muted small" v-if="canVote">
            Şüphelendiğin kişiye dokun. Fikrini değiştirebilirsin; aynı kişiye
            tekrar dokunursan oyun geri alınır.
          </p>
          <div class="grid pick">
            <button
              v-for="p in voteTargets"
              :key="p.pid"
              class="tile"
              :class="{ selected: myVote === p.pid }"
              :disabled="!canVote || p.pid === s.me.pid"
              @click="vote(p.pid)"
            >
              <Avatar
                :speaking="talk(p.pid)"
                :mic="inVoice(p.pid)"
                :name="p.name"
                :size="54"
              />
              <span class="votes-badge" v-if="countOf(p.pid)">{{
                countOf(p.pid)
              }}</span>
              <span class="name">{{ p.name }}</span>
              <span class="reacts"
                ><span v-for="r in reactsFor(p.pid)" :key="r.id" class="fly">{{
                  r.emoji
                }}</span></span
              >
              <small v-if="p.pid === s.me.pid" class="muted">sen</small>
            </button>
          </div>
          <button
            class="btn small pass"
            :class="{ chosen: myVote === 'pass' }"
            :disabled="!canVote"
            @click="vote('pass')"
          >
            🤷 Pas geç
            <span v-if="countOf('pass')">({{ countOf("pass") }})</span>
          </button>
          <div class="who-voted" v-if="voteLines.length">
            <div v-for="line in voteLines" :key="line.voter">
              <b>{{ line.voter }}</b> → {{ line.target }}
            </div>
          </div>
          <p class="settle" v-if="settle">
            Herkes oy verdi. Oylar {{ settle }} sn sonra sayılacak…
          </p>
          <p class="muted small">
            {{ s.votedCount }}/{{ alivePlayers.length }} kişi oy verdi. En çok
            oyu alan asılır; eşitlikte kimse asılmaz.<template
              v-if="s.settings.defense && phase === 'day'"
            >
              İlk ikiye savunma hakkı verilir.</template
            >
          </p>
          <button class="btn danger" v-if="isSt" @click="act('next')">
            ⚖️ Oylamayı bitir
          </button>
        </div>
      </template>

      <!-- ========== LAST WORDS ========== -->
      <div class="card center lastwords" v-if="phase === 'lastwords'">
        <Avatar
          v-if="condemned"
          :speaking="talk(condemned.pid)"
          :name="condemned.name"
          :size="84"
        />
        <h3>{{ condemned ? condemned.name : "" }} son sözlerini söylüyor</h3>
        <p v-if="condemned && condemned.pid === s.me.pid">
          Köy seni asmaya karar verdi. Sohbetten son sözlerini yazabilirsin.
        </p>
        <p class="muted" v-else>Dinleyin… sonra ip çekilecek.</p>
        <button class="btn danger" v-if="isSt" @click="act('next')">
          ⚰️ Asılsın
        </button>
      </div>

      <!-- ========== DUSK ========== -->
      <div class="card center" v-if="phase === 'dusk'">
        <p v-if="s.executed">
          ⚰️ <b>{{ s.executed.name }}</b> asıldı<template v-if="s.executed.role"
            >. O bir <b>{{ s.roles[s.executed.role].was }}</b></template
          >.
        </p>
        <p v-else>Bugün kimse asılmadı.</p>
        <p class="muted" v-if="s.mode === 'auto'">Gece birazdan çöküyor…</p>
        <button class="btn primary" v-if="isSt" @click="act('next')">
          🌙 Geceyi başlat
        </button>
      </div>

      <!-- ========== OVER ========== -->
      <template v-if="phase === 'over'">
        <div class="card center winner" :class="s.winner">
          <div class="big">
            {{ { vampir: "🧛", deli: "🤡" }[s.winner] || "🎉" }}
          </div>
          <h2>
            {{
              {
                vampir: "Vampirler kazandı!",
                deli: "Deli kazandı!",
              }[s.winner] || "Köylüler kazandı!"
            }}
          </h2>
          <p v-if="myResult" class="result">{{ myResult }}</p>
          <button
            class="btn primary"
            v-if="s.events && s.events.length"
            @click="$refs.reel.openPlayer(0)"
          >
            🎬 Oyunun hikâyesini izle
          </button>
        </div>
        <div class="card penalties" v-if="s.penalties && s.penalties.length">
          <h3>🎲 Ceza zamanı!</h3>
          <div
            class="penalty"
            v-for="(x, i) in s.penalties"
            :key="x.pid"
            :class="{ done: x.done, mine: x.pid === s.me.pid }"
            :style="{ animationDelay: i * 0.15 + 's' }"
          >
            <div class="who">
              <Avatar :name="x.name" :size="40" />
              <b>{{ x.name }}</b>
              <span v-if="x.done" class="ok">✅ yaptı</span>
            </div>
            <p class="text">{{ x.text }}</p>
            <div class="row" v-if="isBoss || x.pid === s.me.pid">
              <button
                class="btn small"
                v-if="!x.rerolled && !x.done"
                @click="act('reroll', { target: x.pid })"
              >
                🎲 Değiştir (1 hak)
              </button>
              <button
                class="btn small"
                :class="{ primary: !x.done }"
                @click="act('penaltyDone', { target: x.pid })"
              >
                {{ x.done ? "↩️ Geri al" : "✅ Yaptı" }}
              </button>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Roller</h3>
          <div class="grid">
            <div
              class="tile"
              v-for="p in s.players"
              :key="p.pid"
              :class="{ won: teamOf(p.role) === s.winner }"
            >
              <Avatar
                :speaking="talk(p.pid)"
                :mic="inVoice(p.pid)"
                :name="p.name"
                :size="54"
                :dead="!p.alive"
                :badge="roleEmoji(p.role)"
              />
              <span class="name">{{ p.name }}</span>
              <span class="reacts"
                ><span v-for="r in reactsFor(p.pid)" :key="r.id" class="fly">{{
                  r.emoji
                }}</span></span
              >
              <small :class="p.role">{{ roleName(p.role) }}</small>
            </div>
          </div>
          <button
            class="btn primary"
            v-if="s.me.isOwner"
            @click="act('newGame')"
          >
            🔁 Yeni oyun
          </button>
          <p class="muted center" v-else>Yeni oyunu oda sahibi başlatabilir.</p>
        </div>
      </template>

      <!-- seer notes -->
      <div class="card" v-if="s.seerLog.length && phase !== 'over'">
        <h3>👁️ Gözcü notların</h3>
        <div v-for="(r, i) in s.seerLog" :key="i" class="seer-line">
          {{ r.round }}. gece: <b>{{ r.name }}</b> —
          {{ r.vampir ? "VAMPİR 🧛" : "vampir değil" }}
        </div>
      </div>

      <!-- village (during the game) -->
      <div class="card" v-if="!['lobby', 'over'].includes(phase)">
        <h3>Köy · {{ alivePlayers.length }} kişi hayatta</h3>
        <div class="grid">
          <div
            class="tile"
            v-for="p in s.players"
            :key="p.pid"
            :class="{ dead: !p.alive }"
            @click="openMod(p)"
          >
            <Avatar
              :speaking="talk(p.pid)"
              :mic="inVoice(p.pid)"
              :name="p.name"
              :size="50"
              :dead="!p.alive"
              :online="p.online"
              :badge="roleEmoji(p.role)"
            />
            <span class="name">{{ p.name }}</span>
            <span class="reacts"
              ><span v-for="r in reactsFor(p.pid)" :key="r.id" class="fly">{{
                r.emoji
              }}</span></span
            >
            <small v-if="p.role" :class="p.role">{{ roleName(p.role) }}</small>
            <small v-else-if="p.pid === s.me.pid" class="muted">sen</small>
            <span class="flags" v-if="p.muted || p.noVote">
              {{ p.muted ? "🔇" : "" }}{{ p.noVote ? "🚫" : "" }}
            </span>
            <button
              v-if="isBoss && p.pid !== s.me.pid && !p.kicked"
              class="mini"
              @click.stop="openMod(p)"
            >
              ⚙️ Yönet
            </button>
          </div>
        </div>
      </div>

      <!-- story so far -->
      <StoryReel ref="reel" />
      <div class="spacer"></div>
    </template>
    <div class="sheet-bg" v-if="mod" @click.self="mod = null">
      <div class="sheet">
        <div class="mod-head">
          <Avatar :name="mod.name" :size="54" :dead="!mod.alive" />
          <div>
            <h3>{{ mod.name }}</h3>
            <small class="muted">
              {{ mod.alive ? "hayatta" : "ölü" }}
              <template v-if="mod.role"> · {{ roleName(mod.role) }}</template>
            </small>
          </div>
        </div>
        <div class="emoji-row" v-if="canReact">
          <button v-for="em in reactionList" :key="em" @click="sendReact(em)">
            {{ em }}
          </button>
        </div>
        <p class="muted small" v-else>Şu an tepki gönderemezsin.</p>
        <template v-if="isBoss && !mod.kicked">
          <button class="btn" @click="modAct('mute')">
            {{
              mod.muted ? "🔊 Susturmayı kaldır" : "🔇 Sustur (sohbet + ses)"
            }}
          </button>
          <button
            class="btn"
            v-if="inGame && mod.alive"
            @click="modAct('punish')"
          >
            ⚖️ Kural ihlali: köyden kov (ölür)
          </button>
          <template v-if="isSt && inGame">
            <button class="btn" v-if="mod.alive" @click="modAct('kill')">
              💀 Öldür
            </button>
            <button class="btn" v-else @click="modAct('revive')">
              ✨ Dirilt
            </button>
          </template>
          <button class="btn danger" @click="modAct('kick')">
            🚪 Odadan at{{ inGame ? " (oyundan çıkar)" : "" }}
          </button>
        </template>
        <button class="btn ghost" @click="mod = null">Vazgeç</button>
      </div>
    </div>
    <Chat />
    <VoiceBar />
  </div>
</template>

<script>
import {
  game,
  act,
  setName,
  toast,
  shareLink,
  setMyPhoto,
  react,
  friends,
} from "../game";
import qrcode from "qrcode-generator";
import { pickPhoto } from "../photo";
import { unlockVoice } from "../voice";
import Avatar from "./Avatar";
import Chat from "./Chat";
import VoiceBar from "./VoiceBar";
import StoryReel from "./StoryReel";
import VideoStrip from "./VideoStrip";
import { voiceChat } from "../voicechat";

const PRESETS = [
  {
    id: "yeni",
    emoji: "🌱",
    name: "Yeni başlayanlar",
    desc: "Vampir, Köylü, Doktor",
    s: {
      doktor: true,
      gozcu: false,
      avci: false,
      cadi: false,
      deli: false,
      muhtar: false,
      kurtadam: false,
      lovers: false,
      secretVotes: false,
      defense: false,
    },
  },
  {
    id: "klasik",
    emoji: "🏛️",
    name: "Klasik",
    desc: "Doktor + Gözcü",
    s: {
      doktor: true,
      gozcu: true,
      avci: false,
      cadi: false,
      deli: false,
      muhtar: false,
      kurtadam: false,
      lovers: false,
      secretVotes: false,
      defense: false,
    },
  },
  {
    id: "zengin",
    emoji: "🎭",
    name: "Zengin",
    desc: "Avcı, Cadı, Muhtar, savunma",
    s: {
      doktor: true,
      gozcu: true,
      avci: true,
      cadi: true,
      deli: false,
      muhtar: true,
      kurtadam: false,
      lovers: false,
      secretVotes: false,
      defense: true,
    },
  },
  {
    id: "kaos",
    emoji: "🌪️",
    name: "Kaos",
    desc: "Bütün roller, aşıklar, gizli oy",
    s: {
      doktor: true,
      gozcu: true,
      avci: true,
      cadi: true,
      deli: true,
      muhtar: true,
      kurtadam: true,
      lovers: true,
      secretVotes: true,
      defense: true,
    },
  },
];

const TOGGLES = [
  {
    key: "secretVotes",
    label: "🤫 Gizli oylama",
    hint: "oylar sayım bitene kadar görünmez",
  },
  {
    key: "defense",
    label: "🗣️ Savunma turu",
    hint: "en çok oy alan ikisi savunma yapar, sonra son oylama",
  },
  { key: "doktor", label: "🩺 Doktor", hint: "5+ oyuncuda" },
  {
    key: "idlePenalty",
    label: "⏰ Pasif oyuncu cezası",
    hint: "art arda 3 kez bir şey yapmayan oy hakkını kaybeder",
  },
  { key: "gozcu", label: "👁️ Gözcü", hint: "" },
  { key: "reveal", label: "Ölenin rolü açıklansın", hint: "" },
  { key: "lastWords", label: "Son söz hakkı", hint: "asılmadan önce 20 sn" },
];

export default {
  components: { Avatar, Chat, VoiceBar, StoryReel, VideoStrip },
  data() {
    return {
      game,
      vc: voiceChat,
      now: Date.now(),
      nameInput: game.name,
      toggles: TOGGLES,
      mod: null,
      customText: "",
      witchHeal: false,
      openedAt: Date.now(),
      showQr: false,
      reactionList: [
        "😱",
        "🤔",
        "😂",
        "👀",
        "😡",
        "❤️",
        "👏",
        "🙄",
        "🤥",
        "🧛",
      ],
      witchPoison: null,
      specialRoles: ["avci", "cadi", "muhtar", "deli", "kurtadam"],
      presets: PRESETS,
    };
  },
  computed: {
    s() {
      return game.state;
    },
    phase() {
      return this.s ? this.s.phase : "";
    },
    isSt() {
      return !!this.s && this.s.me.isStoryteller;
    },
    st() {
      return (this.s && this.s.storyteller) || { night: {}, allVoted: false };
    },
    myRole() {
      return this.s && this.s.me.role ? this.s.roles[this.s.me.role] : null;
    },
    elapsed() {
      return Math.max(0, this.now - game.receivedAt);
    },
    secondsLeft() {
      if (!this.s || !this.s.remaining) return 0;
      return Math.max(0, Math.round((this.s.remaining - this.elapsed) / 1000));
    },
    clock() {
      if (!this.s || !this.s.remaining) return "";
      const sec = this.secondsLeft;
      return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
    },
    lowTime() {
      return this.clock && this.secondsLeft <= 10;
    },
    settle() {
      if (!this.s || !this.s.settle) return 0;
      return Math.max(0, Math.round((this.s.settle - this.elapsed) / 1000));
    },
    phaseTitle() {
      const r = this.s ? this.s.round : 0;
      return (
        {
          lobby: "Bekleme odası",
          roles: "Roller dağıtıldı",
          night: `🌙 ${r}. Gece`,
          day: `☀️ ${r}. Gün`,
          lastwords: "⚖️ Son sözler",
          defense: "🗣️ Savunma",
          runoff: "⚖️ Son oylama",
          dusk: "🌆 Akşam",
          over: "🏁 Oyun bitti",
        }[this.phase] || ""
      );
    },
    isBoss() {
      return !!this.s && (this.s.me.isOwner || this.isSt);
    },
    inGame() {
      return !["lobby", "over"].includes(this.phase);
    },
    slowStart() {
      void this.now;
      return !this.s && Date.now() - this.openedAt > 5000;
    },
    takenCount() {
      return this.s.cards ? this.s.cards.filter((c) => c.taken).length : 0;
    },
    canReact() {
      return this.isSt || (this.s.canWrite || []).includes("town");
    },
    friendList() {
      void this.s.phase;
      return friends().slice(0, 20);
    },
    qrData() {
      const qr = qrcode(0, "M");
      qr.addData(shareLink());
      qr.make();
      return qr.createDataURL(8, 2);
    },
    voteTargets() {
      if (this.phase === "runoff" && this.s.runoff) {
        return this.alivePlayers.filter((p) =>
          this.s.runoff.candidates.includes(p.pid),
        );
      }
      return this.alivePlayers;
    },
    hasBots() {
      return this.s.players.some((p) => p.bot);
    },
    alivePlayers() {
      return this.s ? this.s.players.filter((p) => p.alive) : [];
    },
    myVote() {
      return this.s ? this.s.votes[this.s.me.pid] : null;
    },
    canVote() {
      return (
        this.s &&
        this.s.me.seated &&
        this.s.me.alive &&
        !this.s.me.noVote &&
        (this.phase === "day" || this.phase === "runoff")
      );
    },
    votedCount() {
      return this.alivePlayers.filter((p) => this.s.votes[p.pid]).length;
    },
    voteLines() {
      return Object.keys(this.s.votes).map((voter) => ({
        voter: this.nameOf(voter),
        target:
          this.s.votes[voter] === "pass"
            ? "pas"
            : this.nameOf(this.s.votes[voter]),
      }));
    },
    condemned() {
      return this.s.players.find((p) => p.pid === this.s.condemned) || null;
    },
    nightTitle() {
      return (
        {
          vampir: "🧛 Kurbanını seç",
          doktor: "🩺 Kimi koruyacaksın?",
          gozcu: "👁️ Kimi araştıracaksın?",
          koylu: "🧑‍🌾 Uyuyorsun",
          cadi: "🧙‍♀️ İksirlerin",
        }[this.s.night.action] || "😴 Uyuyorsun"
      );
    },
    nightHelp() {
      return (
        {
          vampir:
            "Diğer vampirlerle aynı kişiyi seçin. Sabah en çok seçilen kişiye saldırılır. Vampir sohbetinden anlaşabilirsiniz.",
          doktor:
            "Seçtiğin kişi bu gece vampirlerden korunur. Kendini de seçebilirsin, ama aynı kişiyi iki gece üst üste koruyamazsın.",
          gozcu:
            "Seçtiğin kişinin vampir olup olmadığını hemen öğreneceksin. Gecede bir kez.",
          koylu:
            "Kimse anlamasın diye sen de şüphelendiğin birini seç. Bunun hiçbir etkisi yok.",
          cadi: "Vampirlerin kimi hedeflediğini görüyorsun. İstersen kurtarma iksiriyle kurbanı kurtar, istersen zehirle birini öldür. Kararını verince gözlerini kapat.",
        }[this.s.night.action] ||
        "Bu gece yeteneğin seni uyandırmıyor. Kimse anlamasın diye şüphelendiğin birini seç; etkisi yok."
      );
    },
    nightTargets() {
      const s = this.s;
      const action = s.night.action;
      return this.alivePlayers.map((p) => {
        let allowed = true;
        let note = "";
        if (action === "vampir" && p.role === "vampir") {
          allowed = false;
          note = "vampir";
        }
        if (action === "doktor" && p.pid === s.night.forbidden) {
          allowed = false;
          note = "dün korundu";
        }
        if (!["vampir", "doktor"].includes(action) && p.pid === s.me.pid) {
          allowed = false;
        }
        if (p.pid === s.me.pid && allowed) note = "sen";
        const badge =
          action === "vampir" && s.night.team
            ? s.night.team.filter((v) => v.target === p.pid).length
              ? "🩸"
              : ""
            : "";
        return { ...p, allowed, note, badge };
      });
    },
    seerResult() {
      if (!this.s || this.s.night.action !== "gozcu") return null;
      const last = this.s.seerLog[this.s.seerLog.length - 1];
      return last && last.round === this.s.round ? last : null;
    },
    vampSummary() {
      const vamp = this.st.night.vamp || {};
      return Object.keys(vamp)
        .map((v) => this.nameOf(v) + " → " + this.nameOf(vamp[v]))
        .join(", ");
    },
    myResult() {
      if (!this.s.me.role) return "";
      return this.teamOf(this.s.me.role) === this.s.winner
        ? "Tebrikler, kazandın! 🏆"
        : "Bu sefer kaybettin.";
    },
    reversedLog() {
      return this.s.log.slice().reverse();
    },
  },
  watch: {
    "s.settings.customPenalties": {
      immediate: true,
      handler(list) {
        if (list) this.customText = list.join("\n");
      },
    },
  },
  mounted() {
    this.timer = setInterval(() => (this.now = Date.now()), 1000);
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
  methods: {
    reactsFor(pid) {
      return this.game.reactions.filter((r) => r.to === pid);
    },
    sendReact(emoji) {
      react(this.mod.pid, emoji);
      this.mod = null;
    },
    async inviteFriend(f) {
      const url = shareLink();
      const text = `${f.name}, Vampir Köylü'ye gel! Oda kodu: ${game.code}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: "Vampir Köylü", text, url });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
      try {
        await navigator.clipboard.writeText(text + " " + url);
        toast("Davet mesajı kopyalandı, " + f.name + "'a gönder.", "success");
      } catch (e) {
        prompt("Bu mesajı gönder:", text + " " + url);
      }
    },
    applyPreset(p) {
      this.act("settings", p.s);
      toast(`${p.name} ayarı seçildi.`, "success");
    },
    shoot(p) {
      if (confirm(`${p.name} vurulsun mu?`))
        this.act("shoot", { target: p.pid });
    },
    witchDone() {
      this.act("witch", { heal: this.witchHeal, poison: this.witchPoison });
    },
    async openMod(p) {
      if (p.pid === this.s.me.pid) {
        // tapping yourself changes your photo
        const data = await pickPhoto();
        if (data) {
          setMyPhoto(data);
          toast("Profil fotoğrafın güncellendi 📷", "success");
        }
        return;
      }
      this.mod = p;
    },
    modAct(kind) {
      const p = this.mod;
      const ask = {
        mute: null,
        punish: `${p.name} kuralları çiğnediği için köyden kovulsun mu? Oyuncu ölür.`,
        kick: `${p.name} odadan atılsın mı?`,
        kill: `${p.name} öldürülsün mü?`,
        revive: `${p.name} diriltilsin mi?`,
      }[kind];
      if (ask && !confirm(ask)) return;
      this.act(kind, { target: p.pid });
      this.mod = null;
    },
    toggleCat(key) {
      const cats = this.s.settings.penaltyCats.slice();
      const i = cats.indexOf(key);
      if (i >= 0) {
        if (cats.length === 1 && !this.s.settings.customPenalties.length)
          return;
        cats.splice(i, 1);
      } else cats.push(key);
      this.act("settings", { penaltyCats: cats });
    },
    saveCustom() {
      const list = this.customText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
      this.act("settings", { customPenalties: list });
      toast(`${list.length} özel ceza kaydedildi.`, "success");
    },
    talk(pid) {
      return !!this.vc.speaking[pid];
    },
    inVoice(pid) {
      return !!this.s && !!this.s.voice && this.s.voice.members.includes(pid);
    },
    drawCard(card) {
      if (card.taken || this.s.me.role || !this.s.me.seated) return;
      this.act("card", { index: card.i });
    },
    act(type, params) {
      unlockVoice();
      act(type, params);
    },
    nameOf(pid) {
      const p = this.s && this.s.players.find((x) => x.pid === pid);
      return p ? p.name : "";
    },
    roleName(id) {
      return id && this.s.roles[id] ? this.s.roles[id].name : "";
    },
    roleEmoji(id) {
      return id && this.s.roles[id] ? this.s.roles[id].emoji : "";
    },
    teamOf(id) {
      return id && this.s.roles[id] ? this.s.roles[id].team : "";
    },
    hasAlive(role) {
      return this.s.players.some((p) => p.alive && p.role === role);
    },
    countOf(target) {
      return Object.values(this.s.votes).filter((t) => t === target).length;
    },
    sit() {
      setName(this.nameInput);
      if (!game.name) toast("Önce adını yaz.", "warning");
    },
    async share() {
      const url = shareLink();
      const text = `Vampir Köylü oynuyoruz! Oda kodu: ${game.code}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: "Vampir Köylü", text, url });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast("Davet linki kopyalandı.", "success");
      } catch (e) {
        prompt("Bu linki arkadaşlarına gönder:", url);
      }
    },
    setting(key, value, number) {
      this.act("settings", { [key]: number ? parseInt(value, 10) : value });
    },
    start() {
      if (this.s.players.length < this.s.min) {
        toast(
          `En az ${this.s.min} oyuncu gerekiyor, şu an ${this.s.players.length} kişi var. Arkadaşlarını davet et ya da 🤖 Bot ekle.`,
          "warning",
          6000,
        );
        return;
      }
      if (confirm(`Oyun ${this.s.players.length} oyuncuyla başlasın mı?`)) {
        this.act("start");
      }
    },
    kick(p) {
      if (confirm(`${p.name} odadan çıkarılsın mı?`)) {
        this.act("kick", { target: p.pid });
      }
    },
    nightPick(p) {
      if (!p.allowed) return;
      if (
        this.s.night.action === "gozcu" &&
        !confirm(
          `${p.name} araştırılsın mı? Gecede sadece bir kez seçebilirsin.`,
        )
      ) {
        return;
      }
      this.act("night", { target: p.pid });
    },
    vote(target) {
      if (!this.canVote) return;
      this.act("vote", { target: this.myVote === target ? null : target });
    },
    stToggle(p) {
      const verb = p.alive ? "öldürülsün" : "diriltilsin";
      if (confirm(`${p.name} ${verb} mi?`)) {
        this.act(p.alive ? "kill" : "revive", { target: p.pid });
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "../vars";

.bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -12px -14px 4px;
  padding: calc(8px + env(safe-area-inset-top)) 12px 8px;
  background: rgba(5, 6, 12, 0.88);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid $line;
}
.code {
  border: 1px solid rgba(233, 180, 76, 0.5);
  background: rgba(233, 180, 76, 0.12);
  color: $gold;
  font-weight: 800;
  letter-spacing: 0.15em;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 15px;
  cursor: pointer;
  span {
    letter-spacing: 0;
  }
}
.phase-title {
  flex: 1;
  font-family: "Cinzel", Georgia, serif;
  font-weight: 700;
  font-size: 17px;
  text-align: center;
}
.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  color: $gold;
  &.low {
    color: #ff5a5f;
    animation: blink 1s infinite;
  }
}
@keyframes blink {
  50% {
    opacity: 0.4;
  }
}
.icon {
  background: none;
  border: 0;
  font-size: 22px;
  cursor: pointer;
  padding: 4px;
}
.offline {
  text-align: center;
  background: rgba(179, 18, 29, 0.85);
  border-radius: 10px;
  padding: 6px;
  margin: 8px 0;
  font-size: 14px;
}
.center {
  text-align: center;
}
h3 {
  margin: 0 0 10px;
  font-size: 19px;
}
.my-role {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 10px 0 0;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: linear-gradient(
    120deg,
    rgba(30, 40, 90, 0.75),
    rgba(15, 18, 40, 0.75)
  );
  color: $text;
  text-align: left;
  cursor: pointer;
  &.vampir {
    background: linear-gradient(
      120deg,
      rgba(110, 10, 22, 0.8),
      rgba(40, 6, 12, 0.8)
    );
  }
  &.st {
    background: rgba(233, 180, 76, 0.12);
    cursor: default;
  }
  .em {
    font-size: 34px;
  }
  b {
    display: block;
    font-size: 18px;
  }
  small {
    color: $muted;
  }
}
.inline {
  display: flex;
  gap: 8px;
  .btn {
    width: auto;
    margin: 0;
  }
}
.big-code {
  font-size: 54px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: $gold;
  margin: 2px 0 4px;
  padding-left: 0.2em;
  text-shadow: 0 0 24px rgba(233, 180, 76, 0.35);
}

/* player tiles */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.04);
  color: $text;
  font: inherit;
  text-align: center;
  .name {
    font-weight: 600;
    font-size: 15px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    font-size: 12px;
  }
  &.dead .name {
    opacity: 0.5;
    text-decoration: line-through;
  }
  &.won {
    background: rgba(233, 180, 76, 0.1);
    border-color: rgba(233, 180, 76, 0.35);
  }
  .x {
    position: absolute;
    top: 2px;
    right: 4px;
    border: 0;
    background: none;
    color: $muted;
    font-size: 15px;
    padding: 4px;
    cursor: pointer;
  }
}
.pick .tile {
  cursor: pointer;
  border-color: rgba(255, 255, 255, 0.12);
  transition:
    transform 0.12s,
    background 0.12s;
  &:active {
    transform: scale(0.96);
  }
  &.selected {
    background: rgba(123, 108, 255, 0.35);
    border-color: #b4a9ff;
    box-shadow: 0 0 0 2px rgba(180, 169, 255, 0.4);
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}
.phase-day .pick .tile.selected {
  background: rgba(179, 18, 29, 0.35);
  border-color: #ff7a80;
  box-shadow: 0 0 0 2px rgba(255, 122, 128, 0.35);
}
.votes-badge {
  position: absolute;
  top: 6px;
  right: 10px;
  min-width: 26px;
  height: 26px;
  border-radius: 13px;
  background: $blood;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
.pass {
  width: 100%;
  &.chosen {
    border-color: $gold;
    background: rgba(233, 180, 76, 0.18);
  }
}
.who-voted {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 10px;
  font-size: 13px;
  color: $muted;
  margin: 8px 0;
  b {
    color: $text;
    font-weight: 600;
  }
}
.deck {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 10px;
  margin: 12px 0;
  perspective: 900px;
}
.play-card {
  position: relative;
  aspect-ratio: 2 / 3;
  border: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  color: $text;
  &:disabled {
    cursor: default;
  }
  .inner {
    position: absolute;
    inset: 0;
    transition: transform 0.8s cubic-bezier(0.3, 1.3, 0.5, 1);
    transform-style: preserve-3d;
  }
  &.flipped .inner {
    transform: rotateY(180deg);
  }
  .back,
  .front {
    position: absolute;
    inset: 0;
    border-radius: 12px;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55);
  }
  .back {
    border: 2px solid rgba(233, 180, 76, 0.7);
    background: repeating-linear-gradient(
        45deg,
        rgba(233, 180, 76, 0.12) 0 6px,
        transparent 6px 12px
      ),
      radial-gradient(circle at 50% 40%, #3b1b5a, #12081f 80%);
    .moon {
      font-size: 28px;
    }
  }
  .front {
    transform: rotateY(180deg);
    border: 2px solid $gold;
    background: radial-gradient(circle at 50% 35%, #2a2f5c, #0b0d1c 80%);
    .em {
      font-size: 32px;
    }
    .rn {
      font-weight: 800;
      font-size: 13px;
    }
  }
  .who {
    font-size: 11px;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: rgba(0, 0, 0, 0.55);
    border-radius: 6px;
    padding: 1px 5px;
  }
  &.taken:not(.mine) .back {
    filter: grayscale(0.7) brightness(0.6);
  }
  &:not(:disabled):hover .back,
  &:not(:disabled):active .back {
    transform: translateY(-4px);
  }
  &.mine .front {
    box-shadow: 0 0 22px rgba(233, 180, 76, 0.6);
  }
}
.warn {
  border-color: rgba(179, 18, 29, 0.6);
  background: rgba(90, 10, 16, 0.55);
  &.soft {
    border-color: rgba(233, 180, 76, 0.5);
    background: rgba(80, 60, 10, 0.45);
  }
}
.flags {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 13px;
}
.penalty-settings {
  margin: 12px 0 6px;
  h4 {
    margin: 4px 0 8px;
  }
  select.full {
    width: 100%;
    min-height: 44px;
    border-radius: 10px;
    background: #151826;
    color: $text;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 16px;
    padding: 0 8px;
  }
  .cat-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
  }
  .cat {
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: $muted;
    border-radius: 18px;
    padding: 6px 12px;
    font-size: 14px;
    &.on {
      color: #1a1204;
      background: $gold;
      border-color: $gold;
      font-weight: 700;
    }
  }
  .custom summary {
    cursor: pointer;
    font-size: 15px;
  }
  textarea {
    width: 100%;
    margin-top: 8px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.4);
    color: $text;
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 10px;
    font-size: 15px;
    font-family: inherit;
  }
}
.penalties {
  border-color: rgba(233, 180, 76, 0.6);
}
.penalty {
  margin: 10px 0;
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    rgba(110, 40, 140, 0.45),
    rgba(40, 14, 60, 0.6)
  );
  border: 1px solid rgba(233, 180, 76, 0.35);
  animation: deal 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both;
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    .ok {
      margin-left: auto;
      color: #9be7b4;
      font-size: 14px;
    }
  }
  .text {
    font-size: 18px;
    line-height: 1.4;
    margin: 10px 0 6px;
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 8px;
    .btn {
      flex: 1;
    }
  }
  &.mine {
    box-shadow: 0 0 0 2px $gold;
  }
  &.done {
    opacity: 0.6;
  }
}
@keyframes deal {
  from {
    transform: rotate(-8deg) scale(0.6) translateY(30px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.mod-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  h3 {
    margin: 0;
  }
}
.sub-h {
  margin: 14px 0 6px;
  font-size: 15px;
  color: $muted;
}
.presets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  .preset {
    text-align: left;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid rgba(233, 180, 76, 0.35);
    background: rgba(233, 180, 76, 0.08);
    color: $text;
    b {
      display: block;
      font-size: 15px;
    }
    small {
      color: $muted;
      font-size: 12px;
    }
  }
}
.role-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
  .cat {
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: $muted;
    border-radius: 18px;
    padding: 7px 12px;
    font-size: 14px;
    &.on {
      color: #1a1204;
      background: $gold;
      border-color: $gold;
      font-weight: 700;
    }
  }
}
.role-help {
  margin-top: 0;
}
.shot {
  border-color: rgba(233, 180, 76, 0.8);
  box-shadow: 0 0 30px rgba(233, 180, 76, 0.25);
}
.lover {
  border-color: rgba(255, 105, 180, 0.6);
  background: rgba(120, 20, 70, 0.4);
}
.victim {
  font-size: 16px;
  background: rgba(179, 18, 29, 0.25);
  border-radius: 10px;
  padding: 8px 10px;
}
.potion {
  margin: 8px 0;
}
.duo {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin: 10px 0;
  > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
}
.reacts {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 0;
  pointer-events: none;
}
.fly {
  position: absolute;
  left: 50%;
  top: 10px;
  font-size: 30px;
  animation: fly-up 2.5s ease-out forwards;
}
@keyframes fly-up {
  0% {
    transform: translate(-50%, 20px) scale(0.4);
    opacity: 0;
  }
  15% {
    transform: translate(-50%, 0) scale(1.3);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -70px) scale(1);
    opacity: 0;
  }
}
.emoji-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin: 8px 0 12px;
  button {
    font-size: 28px;
    padding: 8px 0;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
  }
}
.inline-btns {
  display: flex;
  gap: 8px;
  .btn {
    flex: 1;
  }
}
.friends {
  text-align: left;
  margin-top: 8px;
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  .friend {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid $line;
    .fn {
      flex: 1;
    }
    .btn {
      margin: 0;
    }
  }
}
.qr {
  width: min(70vw, 300px);
  height: auto;
  background: white;
  padding: 10px;
  border-radius: 14px;
  image-rendering: pixelated;
}
.need {
  color: #ffb3b6;
  font-size: 15px;
  line-height: 1.4;
}
.bot-row {
  display: flex;
  gap: 8px;
  .btn {
    flex: 1;
  }
}
.btn.dim {
  opacity: 0.55;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 5px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
}
.settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 10px;
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    color: $muted;
  }
  select {
    min-height: 44px;
    border-radius: 10px;
    background: #151826;
    color: $text;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 16px;
    padding: 0 8px;
  }
}
.toggles {
  margin: 10px 0 4px;
}
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  border-bottom: 1px solid $line;
  font-size: 16px;
  small {
    display: block;
    font-size: 12px;
  }
  input {
    width: 24px;
    height: 24px;
    accent-color: $gold;
  }
}
.night {
  border-color: rgba(123, 108, 255, 0.5);
  box-shadow: 0 0 40px rgba(123, 108, 255, 0.12);
}
.team {
  font-size: 15px;
  background: rgba(179, 18, 29, 0.18);
  border-radius: 10px;
  padding: 8px 10px;
}
.done {
  color: #9be7b4;
}
.seer-result {
  font-size: 20px;
  font-weight: 800;
  text-align: center;
  padding: 14px;
  border-radius: 12px;
  background: rgba(47, 158, 90, 0.25);
  margin: 10px 0;
  &.bad {
    background: rgba(179, 18, 29, 0.35);
  }
}
.seer-line {
  margin: 4px 0;
}
.st-night {
  padding-left: 0;
  list-style: none;
  li {
    margin: 6px 0;
  }
}
.ok {
  color: #9be7b4;
}
.banner {
  font-size: 17px;
  border-left: 4px solid $gold;
}
.lastwords {
  border-color: rgba(179, 18, 29, 0.6);
  h3 {
    margin-top: 10px;
  }
}
.settle {
  color: $gold;
  font-weight: 700;
}
.small {
  font-size: 14px;
}
.winner {
  .big {
    font-size: 80px;
    animation: float 3s ease-in-out infinite;
  }
  h2 {
    margin: 4px 0;
    font-size: 30px;
    color: $gold;
  }
  &.vampir h2 {
    color: #ff5a5f;
  }
  .result {
    font-size: 18px;
    font-weight: 700;
  }
}
@keyframes float {
  50% {
    transform: translateY(-8px);
  }
}
small.vampir {
  color: #ff5a5f;
}
small.doktor {
  color: #7fd6ff;
}
small.gozcu {
  color: #c9a7ff;
}
.mini {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: $text;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
.log p {
  margin: 6px 0;
  font-size: 15px;
  line-height: 1.4;
  color: $muted;
  &:first-of-type {
    color: $text;
  }
}
.spacer {
  height: 70px;
}
</style>
