const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');

// --- 1. การเตรียมข้อมูล ---
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

// --- 2. การตั้งค่า BOT และ SERVER ---
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const app = express();
const client = new line.Client(config);

// --- 3. สถาปัตยกรรมเกม ---
const gameRooms = {};
const soloSessions = {};

function findUserRoom(userId) {
    return Object.values(gameRooms).find(room => room.players.red?.id === userId || room.players.blue?.id === userId);
}

// --- 4. ฟังก์ชันหลักของเกม ---
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

// --- 5. WEBHOOK และตัวจัดการ EVENT ---
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
    if (event.type === 'follow') {
        console.log(`New user followed: ${event.source.userId}`);
        const welcomeMessage = {
            type: 'text',
            text: 'ว่าไงเพื่อนซี้! ยินดีต้อนรับสู่ BioBuddy 🧬✨\n\nฉันคือบอทช่วยสอนเรื่องอาณาจักรสัตว์ในรูปแบบเกม "Who is it?" สนุกและได้ความรู้แน่นอน!\n\nเลือกโหมดที่อยากเล่นจากเมนูด้านล่างได้เลย 👇',
            quickReply: {
                items: [
                    { type: 'action', action: { type: 'message', label: 'แข่งขันกับเพื่อน ⚔️', text: 'สร้างเกม' } },
                    { type: 'action', action: { type: 'message', label: 'ฝึกเล่นกับบอท 🤖', text: 'ฝึกเล่น' } },
                    { type: 'action', action: { type: 'message', label: 'ดูวิธีเล่น 📜', text: 'กติกา' } }
                ]
            }
        };
        return client.replyMessage(event.replyToken, welcomeMessage);
    }
    
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    const userMessage = event.message.text.trim();
    const userId = event.source.userId;

    const infoMatch = userMessage.match(/(?:ขอข้อมูล|อยากรู้เกี่ยวกับ|ข้อมูลของ|ดูข้อมูล|บอกข้อมูล|ลักษณะของ)\s*(.+)/i);
    if (infoMatch) {
        const animalName = infoMatch[1].trim();
        if (animalData[animalName]) {
            const info = `จัดไป! ข้อมูลของน้อง ${animalName} 🧐\n\n`+
                         `✨ **ลักษณะเด่น:** ${animalData[animalName]['ลักษณะเด่น']}\n\n`+
                         `🧠 **สาระน่ารู้:** ${animalData[animalName]['สาระน่ารู้']}\n\n`+
                         `🧬 **Phylum:** ${animalData[animalName]['Phylum']}`;
            return client.replyMessage(event.replyToken, { type: 'text', text: info });
        } else {
            return client.replyMessage(event.replyToken, { type: 'text', text: `บัดดี้ไม่มีข้อมูลของ "${animalName}" อ่ะเพื่อน ลองเช็คชื่ออีกทีนะ` });
        }
    }
    
    if (userMessage.match(/(กติกา|กฎ|วิธีเล่น)/i)) {
        const ruleText = 'กติกา Who is it? by BioBuddy 🧬✨\n\n' +
            '**มี 2 โหมดให้เลือกนะ:**\n\n' +
            '**1. เล่นกับเพื่อน (2 คน):**\n' +
            '   - คนแรกพิมพ์ "สร้างเกม" แล้วส่งโค้ดให้เพื่อน\n' +
            '   - เพื่อนพิมพ์ "เข้าร่วม [โค้ด]"\n' +
            '   - ทำตามขั้นตอนที่บอทบอกได้เลย!\n\n' +
            '**2. ฝึกเล่นกับบอท (1 คน):**\n' +
            '   - พิมพ์ "ฝึกเล่น" เพื่อเริ่มเกม\n' +
            '   - บอทจะคิดสัตว์ 1 ตัวไว้ในใจ\n' +
            '   - เธอต้องถามคำถาม "ใช่/ไม่ใช่" เพื่อหาคำตอบ\n' +
            '   - ถามได้ 2 แบบ:\n' +
            '     1. ถามเอง: "มีขนใช่ไหม?"\n' +
            '     2. ให้บอทช่วย: "แนะนำคำถาม"\n' +
            '   - มั่นใจแล้วพิมพ์ "ทาย: [ชื่อสัตว์]"\n\n' +
            '💡 **ตัวช่วย:** พิมพ์ "จบเกม" เพื่อออกจากโหมดปัจจุบันได้ตลอดเวลา';
        return client.replyMessage(event.replyToken, { type: 'text', text: ruleText });
    }

    const room = findUserRoom(userId);
    const soloSession = soloSessions[userId];
    
    if (userMessage.match(/จบเกม/i)) {
        let replied = false;
        if(room) {
            const opponentTeam = room.players.red.id === userId ? 'blue' : 'red';
            if(room.players[opponentTeam]) {
                await client.pushMessage(room.players[opponentTeam].id, { type: 'text', text: `อีกทีมขอจบเกมแล้ว! ไว้มาเล่นกันใหม่นะ 😉` });
            }
            delete gameRooms[room.id];
            replied = true;
        }
        if(soloSession) {
            delete soloSessions[userId];
            replied = true;
        }

        if (replied) {
            const goodbyeMessage = {
                type: 'text',
                text: 'โอเค ออกจากเกมแล้ว! อยากเล่นใหม่ก็เลือกจากเมนูด้านล่างได้เลย 👇',
                quickReply: {
                    items: [
                        { type: 'action', action: { type: 'message', label: 'แข่งขันกับเพื่อน ⚔️', text: 'สร้างเกม' } },
                        { type: 'action', action: { type: 'message', label: 'ฝึกเล่นกับบอท 🤖', text: 'ฝึกเล่น' } },
                        { type: 'action', action: { type: 'message', label: 'ดูวิธีเล่น 📜', text: 'กติกา' } }
                    ]
                }
            };
            return client.replyMessage(event.replyToken, goodbyeMessage);
        }
    }

    // --- Practice Mode Logic (1 Player) ---
    if (soloSession) {
        const practiceQuestionMatch = userMessage.match(/(?:มี|มันมี)\s*(.+?)\s*(?:มั้ย|ไหม|ใช่ป่ะ|รึเปล่า)\??$/i);
        if (practiceQuestionMatch) {
            const traitToCheck = practiceQuestionMatch[1].trim();
            const secretAnimalTraits = animalData[soloSession.secretAnimal];
            let foundMatch = false;
            for (const trait in secretAnimalTraits) {
                if (trait.includes(traitToCheck) && secretAnimalTraits[trait] === 'ใช่') {
                    foundMatch = true;
                    break;
                }
            }
            return client.replyMessage(event.replyToken, { type: 'text', text: foundMatch ? 'ใช่ ✅' : 'ไม่ใช่ ❌' });
        }

        const guessMatch = userMessage.match(/(?:ทาย|ตอบว่า|คำตอบคือ)[:：\s]*(.+)/i);
        if (guessMatch) {
            const guessedAnimal = guessMatch[1].trim();
            if (guessedAnimal === soloSession.secretAnimal) {
                const winText = `💥 BINGO! 💥 ถูกต้องนะค้าบ!\nสัตว์ที่บัดดี้คิดไว้คือ "${soloSession.secretAnimal}" นั่นเอง!\n\nเก่งมาก! อยากฝึกอีกรอบก็พิมพ์ "ฝึกเล่น" มาได้เลย!`;
                delete soloSessions[userId];
                 return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: winText,
                    quickReply: {
                        items: [
                            { type: 'action', action: { type: 'message', label: 'ฝึกเล่นอีกครั้ง 🤖', text: 'ฝึกเล่น' } },
                            { type: 'action', action: { type: 'message', label: 'กลับเมนูหลัก 🏠', text: 'เมนู' } }
                        ]
                    }
                });
            } else {
                return client.replyMessage(event.replyToken, { type: 'text', text: `ยังไม่ใช่! ลองอีกทีนะ 🤔` });
            }
        }
        
        return client.replyMessage(event.replyToken, { type: 'text', text: `ตอนนี้อยู่ในโหมดฝึกเล่นนะ! ถามคำถามเกี่ยวกับสัตว์ที่ฉันคิดไว้ หรือ "ทาย" ได้เลย! (พิมพ์ "จบเกม" เพื่อออก)` });
    }

    // --- Room Game Logic (2 Players) ---
    if (room) {
        const userTeam = room.players.red.id === userId ? 'red' : 'blue';
        const checkMatch = userMessage.match(/(?:เช็ค|สัตว์เรามี|ของเรามี|ดูข้อมูล)[\s:：]*(.+?)\s*(?:มั้ย|ไหม|ใช่ป่ะ|รึเปล่า)\??$/i);
        if (checkMatch) {
            const traitToCheck = checkMatch[1].trim();
            const secretAnimal = room.players[userTeam].secretAnimal;
            if (!secretAnimal) return client.replyMessage(event.replyToken, { type: 'text', text: 'เธอต้องเลือกสัตว์ลับก่อนนะ ถึงจะเช็คได้!' });
            let foundTrait = null, foundValue = null;
            for (const trait in animalData[secretAnimal]) {
                if (trait.includes(traitToCheck)) {
                    foundTrait = trait;
                    foundValue = animalData[secretAnimal][trait];
                    break;
                }
            }
            if (foundTrait) {
                const replyText = `เช็คให้แล้ว! สำหรับสัตว์ลับของเธอ ("${secretAnimal}")...\n\n` + `Q: "${foundTrait}"\n` + `A: **${foundValue}**\n\n` + `เอาข้อมูลนี้ไปตอบอีกฝั่งได้เลย! 😉`;
                return client.replyMessage(event.replyToken, { type: 'text', text: replyText });
            } else {
                return client.replyMessage(event.replyToken, { type: 'text', text: `เอ...ไม่เจอลักษณะที่ถามเกี่ยวกับ "${traitToCheck}" ในข้อมูลของเราอ่ะ ลองใช้คีย์เวิร์ดอื่นที่สั้นลงดูนะ` });
            }
        }
        if (room.state === 'choosing') {
            const secretMatch = userMessage.match(/(?:สัตว์ลับ|สัตว์เรา|เลือกตัวนี้)คือ\s*(.+)/i);
            if(secretMatch) {
                const animalName = secretMatch[1].trim();
                if (allAnimalNames.includes(animalName)) {
                    room.players[userTeam].secretAnimal = animalName;
                    await client.replyMessage(event.replyToken, { type: 'text', text: `โอเค! บัดดี้รับรู้แล้วว่าสัตว์ลับของเธอคือ "${animalName}" 🤫` });
                    if (room.players.red.secretAnimal && room.players.blue.secretAnimal) {
                        room.state = 'rolling';
                        const rollMessage = "เลือกสัตว์ลับกันครบแล้ว! ต่อไปมาวัดดวงกันหน่อย...\n\nแต่ละทีมพิมพ์ 'ทอยเต๋า' 🎲 เพื่อดูว่าใครจะได้เริ่มก่อน!";
                        await client.pushMessage(room.players.red.id, { type: 'text', text: rollMessage });
                        await client.pushMessage(room.players.blue.id, { type: 'text', text: rollMessage });
                    }
                } else {
                     return client.replyMessage(event.replyToken, { type: 'text', text: `เอ๊ะ! สัตว์ชื่อ "${animalName}" ไม่มีในระบบอ่ะ ลองเช็คชื่อแล้วพิมพ์ใหม่นะ` });
                }
            }
        }
        if (room.state === 'rolling') {
            if (userMessage.match(/(ทอยเต๋า|ทอยลูกเต๋า|วัดดวง)/i)) {
                if (room.players[userTeam].hasRolled) {
                    return client.replyMessage(event.replyToken, { type: 'text', text: "เธอทอยไปแล้วเพื่อน รออีกทีมก่อนนะ!" });
                }
                const diceRoll = Math.floor(Math.random() * 6) + 1;
                room.players[userTeam].diceScore = diceRoll;
                room.players[userTeam].hasRolled = true;
                
                const opponentTeam = userTeam === 'red' ? 'blue' : 'red';
                await client.pushMessage(room.players[opponentTeam].id, { type: 'text', text: `ทีม ${room.players[userTeam].name} ทอยได้ ${diceRoll} แต้ม!` });
                await client.replyMessage(event.replyToken, { type: 'text', text: `เธอทอยได้ ${diceRoll} แต้ม! 🎲` });
                
                if (room.players.red.hasRolled && room.players.blue.hasRolled) {
                    let resultText = "ทอยกันครบแล้ว! ผลคือ...\n\n";
                    if (room.players.red.diceScore > room.players.blue.diceScore) {
                        room.currentTurn = 'red';
                        resultText += `ทีม ${room.players.red.name} แต้มตึงกว่า! ได้เริ่มถามก่อนเลย จัดไป!`;
                    } else if (room.players.blue.diceScore > room.players.red.diceScore) {
                        room.currentTurn = 'blue';
                        resultText += `ทีม ${room.players.blue.name} แต้มเหนือกว่า! ได้เริ่มถามก่อนนะค้าบ!`;
                    } else {
                        room.currentTurn = 'red'; // Tie-break
                        resultText += `แต้มเท่ากันเฉย! งั้น...ให้ทีม ${room.players.red.name} เริ่มก่อนละกัน! 😜`;
                    }
                    room.state = 'playing';
                    const startMessage = resultText + '\n\nพิมพ์ "แนะนำคำถาม" เพื่อให้ BioBuddy ช่วยไกด์ได้เลย!';
                    await client.pushMessage(room.players.red.id, { type: 'text', text: startMessage });
                    await client.pushMessage(room.players.blue.id, { type: 'text', text: startMessage });
                } else {
                    await client.replyMessage(event.replyToken, { type: 'text', text: `รอทีม ${room.players[opponentTeam].name} ทอยต่อเลย!` });
                }
            }
        }
        if (room.state === 'playing') {
            if (room.currentTurn !== userTeam) {
                return client.replyMessage(event.replyToken, { type: 'text', text: 'ใจเย็นเพื่อนซี้! ยังไม่ถึงตาของเธอนะ (แต่แอบเช็คข้อมูลสัตว์ตัวเองได้นะ 🤫)' });
            }

            if (userMessage.match(/(แนะนำคำถาม|ขอคำถาม|ถามไรดี|ไกด์หน่อย)/i)) {
                const question = recommendQuestion(room.players[userTeam].remainingAnimals);
                if (question) {
                    room.lastQuestion = question;
                    return client.replyMessage(event.replyToken, { type: 'text', text: `จัดไป! เอาคำถามนี้ไปถามอีกฝั่งเลย:\n\n"สัตว์ของพวกเธอมีลักษณะ '${question.trait}' เป็น '${question.value}' ใช่ป่ะ?"` });
                } else {
                    return client.replyMessage(event.replyToken, { type: 'text', text: "อุ๊ย! ไม่มีคำถามแนะนำแล้วอ่ะ ลองทายเลยมั้ย?" });
                }
            }
            
            const handleYesNoAnswer = async (isYes) => {
                if (!room.lastQuestion) {
                    return client.replyMessage(event.replyToken, { type: 'text', text: 'ต้อง "แนะนำคำถาม" ก่อนนะ ถึงจะบอกคำตอบได้' });
                }
            
                const animalsBefore = [...room.players[userTeam].remainingAnimals];
                const { trait, value } = room.lastQuestion;
            
                const animalsAfter = animalsBefore.filter(animal => {
                    const hasTrait = (animalData[animal][trait] === value);
                    return isYes ? hasTrait : !hasTrait;
                });
            
                room.players[userTeam].remainingAnimals = animalsAfter;
                const eliminatedAnimals = animalsBefore.filter(animal => !animalsAfter.includes(animal));
            
                let replyToCurrentPlayer = `โอเค! รับทราบคำตอบนะ\n\n`;
                const listLimit = 8;
            
                if (eliminatedAnimals.length > 0) {
                    replyToCurrentPlayer += `❌ สัตว์ที่ถูกตัดออก (${eliminatedAnimals.length} ตัว):\n`;
                    replyToCurrentPlayer += eliminatedAnimals.length > listLimit
                        ? `- ${eliminatedAnimals.slice(0, listLimit).join('\n- ')}\n- และอีก ${eliminatedAnimals.length - listLimit} ตัว\n\n`
                        : `- ${eliminatedAnimals.join('\n- ')}\n\n`;
                } else {
                    replyToCurrentPlayer += `รอบนี้ไม่มีสัตว์ถูกตัดออกเลย\n\n`;
                }
            
                if (animalsAfter.length > 0) {
                    replyToCurrentPlayer += `✅ สัตว์ที่ยังเหลืออยู่ (${animalsAfter.length} ตัว):\n`;
                    replyToCurrentPlayer += animalsAfter.length > listLimit
                        ? `- ${animalsAfter.slice(0, listLimit).join('\n- ')}\n- และอีก ${animalsAfter.length - listLimit} ตัว`
                        : `- ${animalsAfter.join('\n- ')}`;
                    if(animalsAfter.length <= 3) {
                        replyToCurrentPlayer += `\n\nเหลือน้อยแล้วนะ! ถ้ามั่นใจก็พิมพ์ "ทาย: [ชื่อสัตว์]" ได้เลย!`;
                    }
                } else {
                    replyToCurrentPlayer += `ไม่เหลือสัตว์ที่ตรงกับเงื่อนไขเลย! อาจมีบางอย่างผิดพลาดนะ`;
                }
                
                await client.replyMessage(event.replyToken, { type: 'text', text: replyToCurrentPlayer });
            
                const opponentTeam = userTeam === 'red' ? 'blue' : 'red';
                const opponentPlayer = room.players[opponentTeam];
                if (opponentPlayer) {
                    if (room.turnBonus > 0) {
                        room.turnBonus--;
                        await client.pushMessage(opponentPlayer.id, { type: 'text', text: `ทีม ${room.players[userTeam].name} ตอบแล้ว! แต่ยังเป็นตาของเธออยู่นะ ถามต่อได้เลย!` });
                    } else {
                        room.currentTurn = opponentTeam;
                        await client.pushMessage(opponentPlayer.id, { type: 'text', text: `ทีม ${room.players[userTeam].name} ตอบแล้ว! ถึงตาเธอถามแล้วนะ ${opponentPlayer.name}!` });
                    }
                }
                room.lastQuestion = null;
            };

            if (userMessage.match(/^(ใช่|ใช่เลย|ถูกต้อง|แม่นแล้ว|y|yes)$/i)) { return handleYesNoAnswer(true); }
            if (userMessage.match(/^(ไม่|ไม่ใช่|ผิด|n|no)$/i)) { return handleYesNoAnswer(false); }
            
            const guessMatch = userMessage.match(/(?:ทาย|ตอบว่า|คำตอบคือ)[:：\s]*(.+)/i);
            if (guessMatch) {
                const guessedAnimal = guessMatch[1].trim();
                const opponentTeam = userTeam === 'red' ? 'blue' : 'red';
                if (guessedAnimal === room.players[opponentTeam].secretAnimal) {
                    room.state = 'gameover';
                    const winText = `💥 BINGO! 💥 ทีม ${room.players[userTeam].name} ทายถูก! สัตว์ลับของอีกฝั่งคือ "${guessedAnimal}"!\n\n🎉 ชนะไปเลยดิค้าบ! 🎉`;
                    const winMessage = { type: 'text', text: winText, quickReply: { items: [ { type: 'action', action: { type: 'message', label: 'เริ่มเกมใหม่ ⚔️', text: 'สร้างเกม' } }, { type: 'action', action: { type: 'message', label: 'กลับไปฝึก 🤖', text: 'ฝึกเล่น' } } ] } };
                    await client.pushMessage(room.players.red.id, winMessage);
                    await client.pushMessage(room.players.blue.id, winMessage);
                    delete gameRooms[room.id];
                } else {
                    room.turnBonus = 1;
                    room.currentTurn = opponentTeam;
                    await client.replyMessage(event.replyToken, { type: 'text', text: `อุ๊ย! ทายผิดจ้าาา 🤣` });
                    await client.pushMessage(room.players[opponentTeam].id, { type: 'text', text: `อีกฝั่งทายผิด! ตาพวกเธอได้สิทธิ์ถาม 2 คำถามติดไปเลย! โคตรโกง! เริ่มเลย!` });
                }
            }
        }
    }


    // Game Starting Commands & Default
    if (!room && !soloSession) {
        if (userMessage.match(/(ฝึกเล่น|เล่นคนเดียว|เล่นกับบอท)/i)) {
            const secretAnimal = allAnimalNames[Math.floor(Math.random() * allAnimalNames.length)];
            soloSessions[userId] = { mode: 'practice', secretAnimal: secretAnimal };
            console.log(`[Practice Mode Started] User: ${userId}, Secret Animal: ${secretAnimal}`);
            return client.replyMessage(event.replyToken, { type: 'text', text: "เริ่มโหมดฝึกเล่น! 🤖\n\nบัดดี้เลือกสัตว์ปริศนาไว้ในใจแล้ว 1 ตัว... ลองถามคำถามเพื่อทายดูสิ!" });
        }
        if (userMessage.match(/(สร้างเกม|สร้างห้อง|เริ่มเกม|เริ่มตี้)/i)) {
            const gameId = `B${Math.floor(100 + Math.random() * 900)}`;
            gameRooms[gameId] = { id: gameId, state: 'waiting', players: { red: { id: userId, name: 'สีแดง ❤️‍🔥', secretAnimal: null, remainingAnimals: [...allAnimalNames], hasRolled: false, diceScore: 0 }, blue: null }, currentTurn: null, lastQuestion: null, turnBonus: 0 };
            return client.replyMessage(event.replyToken, { type: 'text', text: `สร้างห้องแล้วเพื่อน! ห้องของเธอคือ: ${gameId}\n\nส่งโค้ดนี้ให้เพื่อนอีกทีม แล้วให้เค้าพิมพ์ "เข้าร่วม ${gameId}" มาเลย!` });
        }
        const joinMatch = userMessage.match(/(?:เข้าร่วม|เข้าเกม|เข้าห้อง|เข้าตี้)\s+([A-Z0-9]+)/i);
        if (joinMatch) {
            const gameId = joinMatch[1].toUpperCase();
            const targetRoom = gameRooms[gameId];
            if (targetRoom && targetRoom.state === 'waiting') {
                targetRoom.players.blue = { id: userId, name: 'สีน้ำเงิน 💧', secretAnimal: null, remainingAnimals: [...allAnimalNames], hasRolled: false, diceScore: 0 };
                targetRoom.state = 'choosing';
                await client.pushMessage(targetRoom.players.red.id, { type: 'text', text: `ทีม ${targetRoom.players.blue.name} เข้ามาในห้องแล้ว!` });
                const messageToBoth = `เกมเริ่ม! 💥 แต่ละทีมพิมพ์บอกสัตว์ลับของตัวเองมาเลย ไม่ต้องกลัวอีกฝั่งไม่เห็นแน่นอน!\n\n**พิมพ์:** "สัตว์ลับคือ [ชื่อสัตว์]"`;
                await client.pushMessage(targetRoom.players.red.id, { type: 'text', text: messageToBoth });
                await client.replyMessage(event.replyToken, { type: 'text', text: `เข้าตี้ ${gameId} สำเร็จ!\n\n` + messageToBoth });
            } else {
                return client.replyMessage(event.replyToken, { type: 'text', text: 'ห้องเกมนี้ไม่มีอยู่อ่ะ หรือเต็มแล้ว ลองใหม่นะ' });
            }
        }
        
        // Default message with Quick Reply buttons for any other text
        const welcomeMessage = {
            type: 'text',
            text: 'ว่าไงเพื่อนซี้! BioBuddy เอง เลือกโหมดที่อยากเล่นได้เลย 👇',
            quickReply: {
                items: [
                    { type: 'action', action: { type: 'message', label: 'แข่งขันกับเพื่อน ⚔️', text: 'สร้างเกม' } },
                    { type: 'action', action: { type: 'message', label: 'ฝึกเล่นกับบอท 🤖', text: 'ฝึกเล่น' } },
                    { type: 'action', action: { type: 'message', label: 'ดูวิธีเล่น 📜', text: 'กติกา' } }
                ]
            }
        };
        return client.replyMessage(event.replyToken, welcomeMessage);
    }
    
    return Promise.resolve(null);
}

// --- 6. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BioBuddy Final Edition is running on port ${PORT}...`);
});
