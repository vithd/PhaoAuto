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
                    const name = context.activity.from.name;
                    const welcomeMessage = `Chao ${name}! Send me direct message for instruction ;)`;
                    await context.sendActivity(welcomeMessage);
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
        if (text.indexOf('đây là group cơm') >= 0 || text.indexOf('하하') >= 0) {
            if (this.isMaster(context.activity)) {
                this.setGroupConversationReference(context.activity);
                let message = 'Dạ, em nhớ rồi ạ';

                if (text.indexOf('하하') >= 0) {
                    message = 'ㅋㅋㅋㅋ ^^~'
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
            && text.indexOf('nhé') >= 0
        ) {
            await this.openOrder(context, next);
            return;
        }

        if (this.orderEnabled || true) {
            await this.placeOrder(context, next);
            return;
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
        await this.sendHelpMessage(context, next);
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

        const reminder = new CronJob(`0 ${remindMinute} ${remindHour} * * *`, async () => {
            await this.adapter.continueConversation(this.groupConversationReference, async turnContext => {
                await turnContext.sendActivity(`Nhà Pháo chuẩn bị chốt cơm nhaaa! Chỉ còn ${this.reminderBefore} phút nữa thôi ạ.`);
                await turnContext.sendActivity(`Nhà Pháo is closing lunch registration! Only ${this.reminderBefore} minutes left.`);
                console.log('Reminder sent');
            });

            reminder.stop();
        }, null, true, 'Asia/Ho_Chi_Minh');

        const order = new CronJob(`0 ${minute} ${hour} * * *`, async () => {
            console.log('Order activated');
            let orderRecords = ['meo', 'chuot'];

            await this.adapter.continueConversation(this.groupConversationReference, async turnContext => {
                await turnContext.sendActivity(`Em chốt cơm nhé, đây là danh sách thưa chị chủ:`);
                await turnContext.sendActivity(orderRecords.join('\n'));
                console.log('Order sent');
            });
            
            this.orderEnabled = false;
            order.stop();
            console.log('Order closed');
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
        return true; // Debug
        const userId = activity.from.id;
        return userId in this.adminConversationReferences;
    }

    setGroupConversationReference(activity) {
        const conversationReference = TurnContext.getConversationReference(activity);
        this.groupConversationReference = conversationReference;

        console.log(`${activity.from.name} told me to setup group`);
    }

    async placeOrder(context, next) {
        console.log(context.activity.text);

        const conversationReference = TurnContext.getConversationReference(context.activity);
        this.orders[conversationReference.user.id] = {
            conversationReference,
            name: context.activity.from.name,
            request: context.activity.text,
        };

        const answers = ['Đã nhận của', 'E nhớ rồi thưa', 'Được rồi ạ, cám ơn', 'Đã nhớ ', 'Vâng, tks', 'Got it!', 'Noted', 'Ok ạ', 'Vâng', 'E nhớ rồi ', 'Dạ', 'Okie', 'Cám ơn', 'Thank you', 'Merci', 'Đã lưu', 'Đã xem'];
        const icons = ['(smilecat)', '(laughcat)', '(coolcat)', '(hearteyescat)'];

        const answer_i = Math.round(Math.random() * 100) % answers.length;
        const icon_i = Math.round(Math.random() * 100) % icons.length;
        const icon = Math.round(Math.random() * 100) % 3 === 1 ? icons[icon_i] : '';

        await context.sendActivity(`${answers[answer_i]} ${context.activity.from.name} ${icon}`);
        await next();
    }

    async sendHelpMessage(context, next, language = 'VN') {
        console.log('sendHelpMessage');
        const name = context.activity.from.name;

        if (language === 'VN') {
            await context.sendActivity(`Xin chào ${name}! Đây là Cơm Pháo~ Hàng ngày vào buổi sáng chị chủ Pháo sẽ gửi cơm vào group và hẹn giờ chốt cơm. Em sẽ mở đăng ký đến giờ chốt cơm, nhận tiền và báo nợ thay mặt chị chủ.
    
            Cách đặt cơm: @phaotudong [so luong] [ghi chu]
            Ví dụ: @Pháo Tự Động 2 nhiều thịt ít rau
            
            Cách hủy cơm: @phaotudong huy
            Ví dụ: @Pháo Tự Động 2 nhiều thịt ít rau
            
            Cách trả tiền: Bỏ tiền vào hộp tiền Cơm Nhà Pháo,tag Pháo Tự Động, thêm chữ x, ghi momo nếu dùng Momo
            Ví dụ "@Pháo Tự Động x" hoặc "@Pháo Tự Động x momo"
    
            For *English instruction* please type "lol"`);
        } else {
            await context.sendActivity(`Hallo ${name}! This is Cơm Pháo Lunch~ Everyday in morning my master will send lunch menu to the group. I'll open registration, take payment and remind paying at the end of the day.
    
            How to order: @Pháo Tự Động [quatity] [note]
            Ex: @Pháo Tự Động 2 nhiều thịt ít rau (It means "more meat less veget")
            
            How to cancel an order: @Pháo Tự Động cancel
            Ex: @Pháo Tự Động cancel
            
            How to pay: Put money in Cơm Nhà Pháo’s money box, tag Pháo Tự Động with an x
            Ex: @Pháo Tự Động x`);
        }


        await next();
    }
}

module.exports.ProactiveBot = ProactiveBot;
