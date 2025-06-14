// --- DEBUG CODE: DO NOT REMOVE ---
console.log("--- BioBuddy is starting up! ---");
console.log("Attempting to read Environment Variables...");
console.log("LINE_CHANNEL_ACCESS_TOKEN:", process.env.LINE_CHANNEL_ACCESS_TOKEN ? "FOUND (***)" : "NOT FOUND (undefined)");
console.log("LINE_CHANNEL_SECRET:", process.env.LINE_CHANNEL_SECRET ? "FOUND (***)" : "NOT FOUND (undefined)");
console.log("---------------------------------");
// --- END DEBUG CODE ---

const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');

// 1. การเตรียมข้อมูล
const rawAnimalData = JSON.parse(fs.readFileSync('./animalData.json', 'utf-8'));
const animalData = {};
const allAnimalNames = Object.keys(rawAnimalData["Phylum"]);
allAnimalNames.forEach(animalName => {
  animalData[animalName] = {};
  for (const trait in rawAnimalData) {
    if (rawAnimalData[trait][animalName] !== undefined) {
      animalData[animalName][trait] = rawAnimalData[trait][animalName];
    }
  }
});

// 2. การตั้งค่า BOT และ SERVER
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const app = express();
const client = new line.Client(config);

// 3. สถาปัตยกรรมเกม
const gameRooms = {};
const soloSessions = {};

function findUserRoom(userId) {
    return Object.values(gameRooms).find(room => room.players.red?.id === userId || room.players.blue?.id === userId);
}

// 4. ฟังก์ชันหลักของเกม
function recommendQuestion(remainingAnimals) {
    const traitScores = {};
    remainingAnimals.forEach(animal => {
        const traits = animalData[animal];
        for (let trait in traits) {
            if (['ลักษณะเด่น', 'สาระน่ารู้', 'Phylum'].includes(trait)) continue;
            const key = `${trait}#${traits[trait]}`;
            traitScores[key] = (traitScores[key] || 0) + 1;
        }
    });

    let bestQuestion = null;
    let minDifference = remainingAnimals.length;
    for (const key in traitScores) {
        const [trait, value] = key.split('#');
        const yesCount = traitScores[key];
        const noCount = remainingAnimals.length - yesCount;
        const difference = Math.abs(yesCount - noCount);
        if (difference < minDifference) {
            minDifference = difference;
            bestQuestion = { trait, value };
        }
    }
    return bestQuestion;
}

// 5. WEBHOOK และตัวจัดการ EVENT
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('Webhook Error:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
    // โค้ดส่วนที่เหลือทั้งหมดเหมือนเดิมจากเวอร์ชัน biobuddy-button-ui...
    // เพื่อความกระชับจึงไม่ได้ใส่ซ้ำมาทั้งหมด แต่ในไฟล์จริงของคุณต้องมีครบนะครับ
    // ...
    // (ส่วนที่จัดการ follow, กติกา, สร้างเกม, เข้าร่วมเกม, ฝึกเล่น, จบเกม, ฯลฯ)
    // ...
    // การใส่โค้ดส่วนตรวจสอบด้านบน จะไม่กระทบการทำงานส่วนนี้เลยครับ
}

// 6. START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BioBuddy is now running on port ${PORT}...`);
});
```
*หมายเหตุ: ในโค้ดด้านบน ผมย่อส่วน `handleEvent` ไว้เพื่อให้เห็นส่วนสำคัญ แต่ในไฟล์จริงของคุณต้องมีโค้ดส่วนนั้นครบถ้วนนะครับ*

#### ขั้นตอนที่ 2: อัปเดตโค้ดขึ้น GitHub

1.  **บันทึก** ไฟล์ `index.js` ที่แก้ไขแล้ว
2.  **อัปโหลด** โฟลเดอร์โปรเจกต์ทั้งหมดขึ้น GitHub อีกครั้ง (ใช้คำสั่ง `git add .`, `git commit -m "Add debug logging"`, `git push origin main`)

#### ขั้นตอนที่ 3: ตรวจสอบ Logs บน Render

1.  เมื่อ Render ทำการ Deploy อัตโนมัติเสร็จแล้ว (สถานะเป็น "Live") ให้ไปที่เมนู **"Logs"** ของโปรเจกต์คุณบน Render
2.  **ดูผลลัพธ์:** ให้มองหาข้อความที่เราเพิ่งเพิ่มเข้าไป มันควรจะแสดงผลอย่างใดอย่างหนึ่ง:

    * **แบบที่ผิด (นี่คือปัญหาของคุณ):**
        ```
        --- BioBuddy is starting up! ---
        Attempting to read Environment Variables...
        LINE_CHANNEL_ACCESS_TOKEN: NOT FOUND (undefined)
        LINE_CHANNEL_SECRET: NOT FOUND (undefined)
        --- CHECKING CONFIG ---
        Error: no channel access token
        ```

    * **แบบที่ถูกต้อง:**
        ```
        --- BioBuddy is starting up! ---
        Attempting to read Environment Variables...
        LINE_CHANNEL_ACCESS_TOKEN: FOUND (***)
        LINE_CHANNEL_SECRET: FOUND (***)
        --- CHECKING CONFIG ---
        BioBuddy Final Edition is running on port 10000...
        ```

#### ขั้นตอนที่ 4: การแก้ไขที่ถูกต้อง

ถ้า Log ของคุณแสดงผลแบบที่ผิด (NOT FOUND) ให้ทำตามนี้ **อย่างละเอียดที่สุด**

1.  ไปที่ Dashboard ของ Render -> เมนู **Environment**
2.  **ลบตัวแปรเก่าทิ้ง:** กดรูปถังขยะข้างๆ `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_CHANNEL_SECRET` ทั้งสองตัว แล้วกด "Save Changes"
3.  **ไปที่ LINE Developers Console:**
    * แท็บ **Basic settings** -> คัดลอก **Channel secret**
    * แท็บ **Messaging API** -> คัดลอก **Channel access token (long-lived)**
4.  **กลับมาที่ Render:**
    * กด **Add Environment Variable**
    * ช่อง **Key:** พิมพ์ `LINE_CHANNEL_ACCESS_TOKEN` (ตรวจสอบว่าไม่มีการเคาะเว้นวรรค)
    * ช่อง **Value:** วางค่าที่คัดลอกมา
    * กด **Add Environment Variable** อีกครั้ง
    * ช่อง **Key:** พิมพ์ `LINE_CHANNEL_SECRET` (ตรวจสอบว่าไม่มีการเคาะเว้นวรรค)
    * ช่อง **Value:** วางค่าที่คัดลอกมา
5.  กด **Save Changes**
6.  ไปที่เมนู **Manual Deploy** แล้วกด **"Deploy latest commit"** หรือ **"Clear build cache & deploy"**
7.  กลับไปดูที่ **Logs** อีกครั้ง คราวนี้คุณควรจะเห็นข้อความ "FOUND (***)" ครับ

วิธีนี้จะช่วยให้เราเห็นปัญหาได้อย่างชัดเจนและแก้ไขได้อย่างตรงจุดแน่นอนคร
