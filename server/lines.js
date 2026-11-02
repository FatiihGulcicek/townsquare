/*
 * Narration lines: the storyteller does not say the same sentence every time.
 * Names are never followed by a suffix, so any name reads correctly.
 */
"use strict";
const crypto = require("crypto");

const POOLS = {
  night: [
    "{r}. gece. Köy uyusun, herkes gözlerini kapatsın ve telefonuna baksın.",
    "{r}. gece çöktü. Rüzgâr uğulduyor, köpekler havlamayı kesti… Herkes gözlerini kapatsın.",
    "Ay bulutların arkasına saklandı. {r}. gece başlıyor; kapılar kilitlensin, gözler kapansın.",
    "Karanlık köyü sardı. {r}. gece, vampirlerin saati. Herkes telefonuna baksın.",
    "Baykuşlar ötmeye başladı. {r}. gece… Gözler kapalı, kalpler hızlı.",
    "Son mum da söndü. {r}. gece başlıyor; kimse dışarı çıkmasın.",
  ],
  dawn: [
    "Günaydın köy! {r}. gün başladı.",
    "Horozlar öttü, {r}. gün doğdu.",
    "Güneş kilisenin kulesini aydınlatırken köy uyanıyor: {r}. gün.",
    "Sis dağılıyor… {r}. günün sabahı.",
    "Kapılar tek tek açılıyor. {r}. gün, herkes meydana!",
  ],
  kill: [
    "Bu gece {name} vampirlerin kurbanı oldu.",
    "Sabah yatağında soğuk ve solgun bulunan {name} artık aramızda değil.",
    "Köy meydanında bir çığlık! Gece vampirlere yem olan {name} hayatını kaybetti.",
    "Kapısı ardına kadar açık bulunan {name} bu sabah uyanmadı.",
    "Boynunda iki küçük iz… {name} vampirlerin elinden kurtulamadı.",
  ],
  quiet: [
    "Bu gece kimse ölmedi.",
    "Mucize! Bu gece kimse ölmedi.",
    "Sessiz bir geceydi; herkes sağ salim uyandı.",
    "Vampirler bu gece aç kaldı, kimse ölmedi.",
  ],
  saved: [
    "Vampirler saldırdı ama Doktor kurbanı kurtardı!",
    "Bir gölge saldırdı ama Doktor tam zamanında yetişti!",
    "Kanlı bir gece olabilirdi… ama Doktor kimseyi bırakmadı.",
  ],
  hangVerb: ["asıldı", "darağacına gönderildi", "köyün kararıyla idam edildi"],
  nohang: [
    "Bugün kimse asılmadı.",
    "Köy karar veremedi; ip bugün boş kaldı.",
    "Bugün kimse darağacına gitmedi. Umarım doğru karardır…",
  ],
  tie: [
    "Oylar eşit çıktı, bugün kimse asılmadı.",
    "Eşitlik! Köy ikiye bölündü, kimse asılmadı.",
  ],
};

function line(kind, values = {}) {
  const pool = POOLS[kind];
  const text = pool[crypto.randomInt(pool.length)];
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    values[key] !== undefined ? values[key] : "",
  );
}

module.exports = { line };
