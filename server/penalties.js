/*
 * Fun penalties for the losers. Family friendly, harmless, and most of them
 * also work when people play over voice chat from different places.
 */
"use strict";

const CATEGORIES = {
  hafif: "Hafif",
  komik: "Komik",
  muzik: "Şarkı ve dans",
  cesur: "Cesur",
  oyun: "Oyunla ilgili",
};

const PENALTIES = {
  hafif: [
    "Kazananların her birine bir hayvan benzetmesi yap (iltifat olarak).",
    "Bir sonraki oyunda herkesi adıyla değil “komşu” diye çağır.",
    "Gözünü kırpmadan 20 saniye boyunca karşındakine bak.",
    "Sevdiğin 5 şarkıyı 10 saniyede say.",
    "Kendini 3 kelimeyle anlat.",
    "Bir sonraki oyuna kadar her cümlende “aslında” kelimesini kullan.",
    "Bir dilekçe yazar gibi kazananlara teşekkür et.",
    "Sevdiğin bir kitabı ya da diziyi 30 saniyede öv.",
    "Bugünü hava durumu gibi özetle: sabah güneşli, akşam vampirli…",
    "Bir sonraki oyunun başında herkese “Bol şans!” diye tek tek seslen.",
    "Kazanan takıma birer iltifat et.",
    "Odadaki herkese bir lakap tak.",
    "Bir sonraki oyunun başına kadar herkese “efendim” diye hitap et.",
    "10 saniye boyunca hiç gülmeden ciddi bir yüzle kameraya/odaya bak.",
    "Bugün yediğin en son şeyi büyük bir reklam gibi anlat.",
    "En sevdiğin hayvanın sesini çıkar.",
    "Alfabeyi tersten söylemeye çalış (Z'den A'ya).",
    "Kendini üçüncü tekil şahıs olarak 1 dakika boyunca anlat.",
    "En kötü espri yeteneğini konuştur: bir fıkra anlat.",
    "1 dakika boyunca her cümleni soru olarak bitir.",
    "En sevdiğin filmi tek bir cümleyle anlat, herkes tahmin etsin.",
    "Önündeki ilk eşyayı alıp onu satmaya çalışan bir pazarcı ol.",
    "Bir sonraki tura kadar herkese “sayın” diye hitap et.",
    "Telefonundaki son fotoğrafı anlat (göstermek zorunda değilsin).",
    "Kendine yeni bir süper kahraman adı uydur ve gücünü anlat.",
    "10 tane meyve adını 15 saniyede say.",
    "En sevdiğin yemeğin tarifini haber spikeri gibi anlat.",
    "Gözlerini kapatıp odadaki herkesin adını sırayla say.",
    "Kazanan takımın kaptanını seçmesi için herkese oy verdir ve onu tebrik et.",
    "Bir tekerleme söyle: “Şu köşe yaz köşesi, şu köşe kış köşesi…”",
    "1 dakika boyunca “hayır” kelimesini kullanmadan soruları cevapla.",
    "Kendini bir hava durumu sunucusu gibi tanıt ve yarının havasını söyle.",
    "Bugün başına gelen en ilginç şeyi abartarak anlat.",
    "Bir sonraki oyunda herkesten önce “Ben masumum!” diye bağır.",
    "Kazananlara “Siz bu köyün gerçek kahramanlarısınız” diye konuşma yap.",
  ],
  komik: [
    "Hayali bir telefonla annene “Ben vampir değilim!” diye açıklama yap.",
    "Bir sonraki tura kadar her cümlenin sonuna “efendim” ekle.",
    "Bir televizyon şefi gibi hayali bir yemek pişir.",
    "Kendi cenaze konuşmanı komik bir şekilde yap.",
    "Bir köy kahvesindeki dedikodu teyzesi gibi son oyunu anlat.",
    "Bir dakika boyunca sadece kafiyeli cümlelerle konuş.",
    "Bir aksiyon filmi fragmanı seslendir: “Bir köy… bir vampir…”.",
    "Kazananlara karşı yenilgini kabul eden bir başbakan konuşması yap.",
    "Bir korsan gibi konuş ve hazineni ara.",
    "Bir sonraki tura kadar her soruya “Bilmiyorum ama içimde bir his var” diye başla.",
    "30 saniye boyunca robot gibi konuş.",
    "Bir sonraki tura kadar sadece fısıldayarak konuş.",
    "Vampir gibi gül: en korkunç kahkahanı at.",
    "Bir tavuk gibi davran ve 15 saniye gıdakla.",
    "Kendini bir belgeselde anlatılan vahşi hayvan gibi tanıt.",
    "Bir futbol spikeri gibi son oyunu anlat.",
    "Odadaki birinin taklidini yap, kim olduğunu bilsinler.",
    "Hayali bir mikrofonla 30 saniye stand-up yap.",
    "Bebek sesiyle bir haber oku.",
    "Bir dakika boyunca her cümleye “Vallahi billahi” diye başla.",
    "Bir kediye ilan-ı aşk eder gibi bir şiir uydur.",
    "En dramatik ölüm sahneni canlandır.",
    "Bir sonraki oyunu bitene kadar konuşurken aksan kullan (Karadeniz, Ege, ne istersen).",
    "Kazanan takım sana bir kelime versin, o kelimeyle reklam sloganı uydur.",
    "Bir köylü olarak köyün muhtarlığına aday ol ve seçim konuşması yap.",
    "Bir vampir olarak köylülerden özür dileyen bir mektup oku.",
    "En kötü dans hareketini 10 saniye yap.",
    "Kendini bir pizza olarak tanıt: malzemelerin, hayallerin, korkuların.",
    "Bir uzaylı gibi dünyayı ilk kez gören biri olarak odayı anlat.",
    "30 saniye boyunca hiç durmadan “Ben suçsuzum” diyerek savunma yap.",
    "Bir sonraki tura kadar her konuşmandan önce “Bip bop” de.",
    "Bir Türk dizisindeki dramatik bir sahneyi canlandır.",
    "Gözlerini kapat ve herkes sana bir şey sorsun, falcı gibi cevapla.",
    "Bir müzayedeci gibi kendi gözlüğünü/kalemini sat.",
    "Bir masal anlat ama her cümle “ve sonra vampirler geldi” ile bitsin.",
    "Bir operadaymış gibi adını söyle.",
    "En sevdiğin şarkıyı sadece “la la” ile söyle, herkes tahmin etsin.",
    "Bir dakika boyunca yavaş çekimde konuş.",
    "Bir köpek gibi havla ve kazananlara kuyruk salla.",
    "Haber spikeri ciddiyetiyle “Köyde son dakika!” diye bir haber oku.",
  ],
  muzik: [
    "Bir şarkıyı tersten söylemeye çalış.",
    "Kazananlar bir şarkı seçsin, sen de sözleri bilmeden mırıldan.",
    "Bir çocuk şarkısını rap gibi söyle.",
    "Mutfak eşyalarıyla 10 saniyelik bir ritim tut.",
    "Bir sonraki oyunun “açılış şarkısını” sen söyle.",
    "En sevdiğin şarkının nakaratını söyle.",
    "Bir çocuk şarkısını opera gibi söyle.",
    "“Mutlu yıllar” şarkısını kazanan takıma söyle.",
    "Bir şarkıyı sadece ıslıkla çal, herkes tahmin etsin.",
    "10 saniye boyunca halay başı gibi mendil salla.",
    "Kazananlar için bir zafer marşı uydur ve söyle.",
    "Bir reklam cıngılını söyle.",
    "Rap yap: konusu “Ben neden kaybettim”.",
    "Bir arabesk şarkıyı en dramatik hâliyle söyle.",
    "30 saniye boyunca beat box yap.",
    "Bir şarkıyı yanlış sözlerle söyle, kimse düzeltmesin.",
    "Bir sonraki oyuna kadar konuşmalarını şarkı söyler gibi yap.",
    "Kazananların adlarıyla kısa bir şarkı uydur.",
    "Bir tango figürü yap (havayla dans etmek serbest).",
    "En sevdiğin dans hareketini 15 saniye boyunca yap.",
    "Bir marşı yavaş ve hüzünlü söyle.",
    "Bir ninni söyle; kazananlar uyuyormuş gibi yapsın.",
    "Bir rock yıldızı gibi hayali gitar çal ve bağır.",
    "Bir türküden bir dörtlük söyle.",
    "Herkesin seçtiği bir şarkıyı 10 saniye söyle.",
  ],
  cesur: [
    "İlk aşkının adının baş harfini söyle.",
    "Telefonundaki en eski fotoğrafı anlat.",
    "En sevdiğin çocukluk oyuncağını anlat.",
    "Bir arkadaşına söyleyemediğin güzel bir şeyi burada söyle.",
    "Hayatındaki en büyük başarı anını anlat.",
    "Hayatında yaptığın en utanç verici şeyi (anlatabileceğin kadarını) anlat.",
    "Odadaki herkes hakkında güzel bir şey söyle.",
    "En son ne zaman ağladığını anlat.",
    "Çocukken neye inanıyordun, itiraf et.",
    "En kötü saç modelini anlat.",
    "Bu oyunda kime gerçekten güvendiğini ve kime güvenmediğini söyle.",
    "Telefonunda en çok kullandığın 3 emojiyi söyle.",
    "Hiç kimseye söylemediğin zararsız bir alışkanlığını itiraf et.",
    "En garip yemek kombinasyonunu itiraf et.",
    "Bu oyunda kimin vampir olduğunu düşündüğünü ve neden yanıldığını anlat.",
    "En son kime mesaj attığını söyle.",
    "Hayalindeki işi anlat ve neden henüz yapmadığını söyle.",
    "Kazananlardan biri sana bir soru sorsun, dürüstçe cevapla.",
    "Okulda başına gelen en komik olayı anlat.",
    "Bir yeteneğini göster (ne olursa).",
    "Kendinde en sevdiğin üç özelliği say.",
    "En büyük korkunu söyle.",
    "En son ne zaman yalan söylediğini (zararsız olanını) anlat.",
    "Bugüne kadar aldığın en kötü hediyeyi anlat.",
    "Kazanan takımın seçtiği birine sesli mesajla “İyi ki varsın” de.",
  ],
  oyun: [
    "Bir sonraki oyunda bot gibi konuş: sadece kısa cümleler.",
    "Bir sonraki oyunun kartını en son sen çek.",
    "Bir sonraki oyunda ölürsen son sözün şiir olsun.",
    "Kazanan takımdan biri senin yerine bir sonraki oyunda ilk oyunu versin.",
    "Bir sonraki oyunda savunma yaparken arka planda müzik mırıldan.",
    "Bir sonraki oyunu sen anlat (anlatıcı modunda).",
    "Bir sonraki oyunda ilk kim olduğunu tahmin et: yanılırsan bir ceza daha.",
    "Bir sonraki oyunda ilk konuşan sen ol ve 30 saniye savunma yap.",
    "Bir sonraki oyunda herkese rolünü açıklamadan önce bir ipucu ver.",
    "Bir sonraki tur boyunca sohbete sadece emoji yazabilirsin.",
    "Bir sonraki oyunda gündüz ilk oyu sen ver.",
    "Bir sonraki oyunda adını kazananlar seçsin.",
    "Kazananlara bu oyunun en iyi oyuncusunu seçtir ve onu öv.",
    "Bu oyunda yaptığın en büyük hatayı herkese açıkla.",
    "Bir sonraki oyunda sesli sohbette sadece fısıldayabilirsin.",
    "Bir sonraki oyunda vampir olursan ilk geceyi “iptal” etmiş gibi kimseyi seçme.",
    "Bir sonraki oyunda oy verirken nedenini bir şiirle açıkla.",
    "Kazanan takım bir sonraki oyunun ayarlarını seçsin.",
    "Bu oyunun özetini bir masal gibi anlat.",
    "Bir sonraki oyunda ilk gece seçtiğin kişiyi herkese söyle.",
  ],
};

const MODES = ["off", "losers", "team", "firstDead", "everyone"];

/** pick penalties without repeating the same one in a round */
function pickPenalties(count, categories, custom, random) {
  const pool = [];
  (categories && categories.length ? categories : Object.keys(PENALTIES))
    .filter((c) => PENALTIES[c])
    .forEach((c) => PENALTIES[c].forEach((text) => pool.push(text)));
  (custom || []).forEach((text) => pool.push(text));
  if (!pool.length) return [];
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    if (used.size >= pool.length) used.clear();
    let text;
    do {
      text = pool[random(pool.length)];
    } while (used.has(text));
    used.add(text);
    out.push(text);
  }
  return out;
}

module.exports = { CATEGORIES, PENALTIES, MODES, pickPenalties };
