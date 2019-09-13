// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, TurnContext } = require('botbuilder');
const sprintf = require('sprintf-js').sprintf;
const CronJob = require('cron').CronJob;

/*
const order = new CronJob('* 30 10 * * *', function() {
    console.log('You will see this message every second');
    order.stop();
}, null, true, 'Asia/Ho_Chi_Minh');
*/

class ProactiveBot extends ActivityHandler {
    constructor(conversationReferences, adapter) {
        super();

        this.adapter = adapter;
        this.debug = true;

        // Master password to access administration features
        this.masterPassword = 'sinhnhatvuivenhavit';

        // Dependency injected dictionary for storing ConversationReference objects used in NotifyController to proactively message users
        this.conversationReferences = conversationReferences;
        this.orderConversationReferences = {};
        this.adminConversationReferences = {};
        this.groupConversationReference = null;
        this.orderEnabled = false;
        this.orders = {};
        this.reminderBefore = 5; // minutes

        this.onConversationUpdate(async (context, next) => {
            this.addConversationReference(context.activity);

            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            for (let cnt = 0; cnt < membersAdded.length; cnt++) {
                if (membersAdded[cnt].id !== context.activity.recipient.id
                    && context.activity.conversation.isGroup) {
                    await context.sendActivity('Chào mừng đến với Cơm Pháo <3 Em là trợ lý ảo của chị chủ group, hãy pm riêng với em để xem hướng dẫn đặt cơm nha~');
                }
            }

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMessage(async (context, next) => {
            this.addConversationReference(context.activity);
            // console.log(context.activity);

            if (context.activity.conversation.isGroup) {
                return this.groupMessageHandler(context, next);
            }
            
            return this.directMessageHandler(context, next);
        });
    }
    
    //
    // Group Message
    //
    async groupMessageHandler(context, next) {
        const text = context.activity.text.toLowerCase().trim();

        // Admin commands
        if (text.indexOf('đây là group cơm') >= 0 || text.indexOf('하하') >= 0 || text.indexOf('khỏe k') >= 0) {
            if (this.isMaster(context.activity)) {
                this.setGroupConversationReference(context.activity);
                let message = 'Dạ, em nhớ rồi ạ';

                if (text.indexOf('하하') >= 0) {
                    message = 'ㅋㅋㅋㅋ ^^~'
                } else if (text.indexOf('khỏe k') >= 0)  {
                    message = 'Dạ em khỏe ạ >:3'
                }

                await context.sendActivity(message);
                await next();
                return;
            }

            await context.sendActivity('Ơ ai đấy ạ? Em không quen');
            await next();
            return;
        }

        // Begin ordering sequences
        if (this.isMaster(context.activity) && 
            (text.indexOf('chốt') >= 0 || text.indexOf('lúc') >= 0
            || text.indexOf('nhờ') >= 0 || text.indexOf('giúp') >= 0)
        ) {
            this.resetOrderJob();
            await this.openOrder(context, next);
            return;
        }

        if (this.orderEnabled || this.debug) {
            const parseOrder = /Pháo Tự Động\s*(\d+)(.*)/.exec(context.activity.text);
            if (parseOrder !== null && parseOrder.length > 1) {
                const quantity = parseInt(parseOrder[1]);
                const note = parseOrder.length === 3 ? parseOrder[2].trim() : '';

                if (Number.isNaN(quantity)) {
                    await context.sendActivity('Sorry >~< Em không đọc được số lượng ạ, đặt lại giùm em nha');
                    await next();
                    return;
                }

                if (quantity === 0) {
                    await context.sendActivity('Aigoooo đừng ghẹo e nữa mààà');
                    await next();
                    return;
                }

                if (note.indexOf('suất') == 0) {
                    note = note.replace('suất', '').trim();
                }

                await this.placeOrder(context, next, quantity, note);
                return;
            }

            if (text.indexOf('hủy') >= 0 || text.indexOf('cancel') >= 0) {
                await this.cancelOrder(context, next);
                return;
            }

            const parsePaid = /\s+x\s+/g.exec(context.activity.text);
            if (parsePaid !== null) {
                await this.payOrder(context, next);
                return;
            }
        }
    }
    
    //
    // Direct Message
    //
    async directMessageHandler(context, next) {
        const text = context.activity.text.toLowerCase().trim();

        // Admin Register
        if (text === this.masterPassword) {
            this.addAdminConversationReference(context.activity);
            await context.sendActivity('My master~ (hearteyescat)');
            await next();
            return;
        }
        
        // Help message
        if (text === 'lol') {
            await this.sendHelpMessage(context, next, 'EN');
            await next();
            return;
        }

        await this.sendHelpMessage(context, next);
        await next();
    }

    resetOrderJob() {
        this.cronReminder && this.cronBill.stop();
        this.cronOrder && this.cronOrder.stop();
        this.cronBill && this.cronBill.stop();
    }

    async openOrder(context, next) {
        let parsedTime = /(\d+)h(\d+)/gi.exec(context.activity.text);
        
        if (parsedTime === null || parsedTime.length !== 3) {
            console.log('Cannot parse time in Order message:' + context.activity.text);
            await context.sendActivity('Ơ chị Pháo ơi, em không đọc được giờ chốt ạ >~<');
            await context.sendActivity('Chị nhớ ghi là "10h30" hay "13h00" e mới hiểu nha');
            await next();
            return;
        }
        
        let rawHour = parsedTime[1], // to keep leading zero in message
            rawMinute = parsedTime[1], // to keep leading zero in message
            hour = parseInt(parsedTime[1]),
            minute = parseInt(parsedTime[2]);

        let remindHour = hour,
            remindMinute = minute - this.reminderBefore;

        if (remindMinute < 0) {
            remindHour = (remindHour - 1) % 24;
            remindMinute = (minute - this.reminderBefore) % 60;
        }
        
        this.orderEnabled = true;
        console.log(`Order at ${rawHour}:${rawMinute}, remind at ${remindHour}:${remindMinute}`);

        // REMINDER
        this.cronReminder = new CronJob(`0 ${remindMinute} ${remindHour} * * *`, async () => {
            await this.adapter.continueConversation(this.groupConversationReference, async turnContext => {
                await turnContext.sendActivity(`Nhà Pháo chuẩn bị chốt cơm nhaaa! Chỉ còn ${this.reminderBefore} phút nữa thôi ạ.`);
                await turnContext.sendActivity(`Nhà Pháo is closing lunch registration! Only ${this.reminderBefore} minutes left.`);
                console.log('Reminder sent');
            });

            this.cronReminder.stop();
        }, null, true, 'Asia/Ho_Chi_Minh');

        // ORDER
        this.cronOrder = new CronJob(`0 ${minute} ${hour} * * *`, async () => {
            console.log('Order activated');

            let orderRecords = [];
            let total = 0;
            for (const order of Object.values(this.orders)) {
                orderRecords.push(
                    sprintf('%-30s %d %s', order.name, order.quantity, order.note)
                );

                total += order.quantity;
            }

            await this.adapter.continueConversation(this.groupConversationReference, async turnContext => {
                if (total > 0) {
                    await turnContext.sendActivity(`Em chốt cơm nhé, đây là danh sách thưa chị chủ:`);
                    await turnContext.sendActivity(orderRecords.join('\n'));
                    await turnContext.sendActivity(`Tổng ${total} suất`);
                } else {
                    await turnContext.sendActivity(`Huhu tổng hnay là 0 suất ;3;`);
                }
                console.log('Order sent');
            });
            
            this.orderEnabled = false;
            this.cronOrder.stop();
            console.log('Order closed');
        }, null, true, 'Asia/Ho_Chi_Minh');
        
        // THE BILL COMES DUE
        // let billHour = hour,
        //     billMinute = (minute + 1) % 60;

        // if (billMinute < minute) {
        //     billHour += 1;
        // }

        let billHour = 17, billMinute = 0;

        this.cronBill = new CronJob(`0 ${billMinute} ${billHour} * * *`, async () => {
            console.log('The bill comes due');

            let orderRecords = [];
            let total = 0;
            for (const order of Object.values(this.orders)) {
                if (order.paid === false) {
                    orderRecords.push(
                        sprintf('%-30s %d %s', order.name, order.quantity, order.note)
                    );

                    total += order.quantity;
                }
            }

            if (total > 0) {
                await this.adapter.continueConversation(this.groupConversationReference, async turnContext => {
                    await turnContext.sendActivity(`Các anh chị ơi đóng tiền giúp em với ạ`);
                    await turnContext.sendActivity(orderRecords.join('\n'));
                    await turnContext.sendActivity(`Tổng nợ ${total} suất`);
                });
            } else {
                // Reset Order
                this.orders = {}
            }

            this.cronBill.stop();
            
        }, null, true, 'Asia/Ho_Chi_Minh');

        await context.sendActivity(`Cơm Nhà Pháo đã mở đăng ký, mọi người đặt cơm trước ${rawHour}h${rawMinute} nhé! PM riêng cho em để xem hướng dẫn na~`);
        await context.sendActivity(`Cơm Nhà Pháo is open for lunch registration, order ends at ${rawHour}:${rawMinute}! Drop me a private message for instruction~`);
        await next();
    }

    addConversationReference(activity) {
        const conversationReference = TurnContext.getConversationReference(activity);
        this.conversationReferences[conversationReference.conversation.id] = conversationReference;
    }

    addAdminConversationReference(activity) {
        const conversationReference = TurnContext.getConversationReference(activity);
        this.adminConversationReferences[conversationReference.user.id] = conversationReference;

        console.log(`${activity.from.name} is my master`);
    }

    isMaster(activity) {
        const userId = activity.from.id;
        return this.debug || userId in this.adminConversationReferences;
    }

    setGroupConversationReference(activity) {
        const conversationReference = TurnContext.getConversationReference(activity);
        this.groupConversationReference = conversationReference;

        console.log(`${activity.from.name} told me to setup group`);
    }

    async placeOrder(context, next, quantity, note) {
        console.log(`${context.activity.from.name} - ${quantity} - ${note}`);

        const conversationReference = TurnContext.getConversationReference(context.activity);

        if (this.groupConversationReference === null) {
            this.groupConversationReference = conversationReference;
        }

        this.orders[conversationReference.user.id] = {
            conversationReference,
            name: context.activity.from.name,
            quantity,
            note,
            paid: false,
        };

        const answers = ['Đã nhận của', 'E nhớ rồi thưa', 'Được rồi ạ', 'Đã nhớ ', 'Vâng, tks', 'Got it!', 'Noted', 'Ok ạ', 'Vâng', 'E nhớ rồi ', 'Dạ', 'Okie', 'Cám ơn', 'Thank you', 'Merci', 'Đã lưu', 'Đã xem'];
        const icons = ['(smilecat)', '(laughcat)', '(coolcat)', '(hearteyescat)'];

        const answer_i = Math.round(Math.random() * 100) % answers.length;
        const icon_i = Math.round(Math.random() * 100) % icons.length;
        const icon = Math.round(Math.random() * 100) % 3 === 1 ? icons[icon_i] : '';

        let answer = answers[answer_i];
        if (Math.round(Math.random() * 1000) === 69) {
            answer = 'Woaaaaa, bất ngờ chưa! Suất may mắn này free cho';
        }

        await context.sendActivity(`${answer} ${context.activity.from.name} ${quantity} suất (${note}) ${icon}`);
        await next();
    }

    async cancelOrder(context, next) {
        const conversationReference = TurnContext.getConversationReference(context.activity);

        if (conversationReference.user.id in this.orders) {
            delete this.orders[conversationReference.user.id];
            await context.sendActivity(`Em đã xóa cơm của ${context.activity.from.name} ạ`);
        } else {
            await context.sendActivity(`Ơ nhưng mà e chưa thấy ${context.activity.from.name} đăng ký ;_;`);
        }

        await next();
    }

    async payOrder(context, next) {
        const conversationReference = TurnContext.getConversationReference(context.activity);

        if (conversationReference.user.id in this.orders) {
            this.orders[conversationReference.user.id].paid = true;

            await context.sendActivity(`${context.activity.from.name} đã đóng tiền~`);

            // Everyone paid, says thanks and cancel The Bill comes due
            let allPaid = true;
            for (order of Object.values(this.orders)) {
                if (order.paid === false) {
                    allPaid = false;
                    break;
                }
            }

            if (allPaid) {
                await context.sendActivity(`Woaa...mọi người đã đóng đủ tiền cho nhà Pháo rồi ạ. Thay mặt chị chủ, em xin cám ơn <3`);
            }
        } else {
            await context.sendActivity(`Ơ sao em thấy ${context.activity.from.name} hôm nay không đăng ký cơm á ;3;`);
        }

        await next();
    }

    async sendHelpMessage(context, next, language = 'VN') {
        const name = context.activity.from.name;

        if (language === 'VN') {
            await context.sendActivity(`Xin chào ${name}! Đây là Cơm Pháo~ Hàng ngày vào buổi sáng chị chủ Pháo sẽ gửi cơm vào group và hẹn giờ chốt cơm. Em sẽ mở đăng ký đến giờ chốt cơm, nhận tiền và báo nợ thay mặt chị chủ.
    
Cách đặt cơm: @Pháo Tự Động [so luong] [ghi chu]
Ví dụ: @Pháo Tự Động 2 nhiều thịt ít rau

Cách hủy cơm: @Pháo Tự Động hủy

Cách trả tiền: Bỏ tiền vào hộp tiền Cơm Nhà Pháo,tag Pháo Tự Động, thêm chữ x, ghi momo nếu dùng Momo
Ví dụ "@Pháo Tự Động x" hoặc "@Pháo Tự Động x momo"

For *English instruction* please type "lol"`);
        } else {
            await context.sendActivity(`Hallo ${name}! This is Cơm Pháo Lunch~ Everyday in morning my master will send lunch menu to the group. I'll open registration, take payment and remind paying at the end of the day.
    
How to order: @Pháo Tự Động [quatity] [note]
Ex: @Pháo Tự Động 2 nhiều thịt ít rau (It means "more meat less veget")

How to cancel an order: @Pháo Tự Động cancel

How to pay: Put cash in Cơm Nhà Pháo’s money box, tag Pháo Tự Động with an x
Ex: @Pháo Tự Động x`);
        }

        await next();
    }
}

module.exports.ProactiveBot = ProactiveBot;
