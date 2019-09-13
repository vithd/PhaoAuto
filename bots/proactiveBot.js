// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, TurnContext } = require('botbuilder');
const sprintf = require('sprintf-js').sprintf;
const CronJob = require('cron').CronJob;

/*
const order = new CronJob('* 30 10 * * *', function() {
  console.log('You will see this message every second');
  order.stop();
}, null, true, 'America/Los_Angeles');
*/

class ProactiveBot extends ActivityHandler {
    constructor(conversationReferences) {
        super();

        // Dependency injected dictionary for storing ConversationReference objects used in NotifyController to proactively message users
        this.conversationReferences = conversationReferences;

        this.onConversationUpdate(async (context, next) => {
            this.addConversationReference(context.activity);

            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            for (let cnt = 0; cnt < membersAdded.length; cnt++) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    const welcomeMessage = this.getHelpMessage(context.activity.from.name);
                    await context.sendActivity(welcomeMessage);
                }
            }

            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMessage(async (context, next) => {
            this.addConversationReference(context.activity);
            const text = context.activity.text.toLowerCase().trim();

            // Help
            if (text.indexOf('help') 
                || text.indexOf('how')
                || text.indexOf('?') 
                || text === 'pháo tự động'
            ) {
                await context.sendActivity(this.getHelpMessage(context.activity.from.name));
            }

            await next();
        });
    }

    addConversationReference(activity) {
        const conversationReference = TurnContext.getConversationReference(activity);
        this.conversationReferences[conversationReference.conversation.id] = conversationReference;

        console.log(conversationReference);
    }

    getHelpMessage(name) {
        return `Xin chào ${name}! Đây là group Cơm Pháo~ Hàng ngày vào buổi sáng chị chủ Pháo sẽ gửi cơm và hẹn giờ chốt cơm. Em sẽ mở đăng ký đến giờ chốt cơm, nhận tiền và báo nợ thay mặt chị chủ.

Cách đặt cơm: @phaotudong [so luong] [ghi chu]
Ví dụ: @Pháo Tự Động 2 nhiều thịt ít rau
Cách trả tiền: Bỏ tiền vào hộp tiền Cơm Nhà Pháo,tag Pháo Tự Động, thêm chữ x, ghi momo nếu dùng Momo
Ví dụ "@Pháo Tự Động x" hoặc "@Pháo Tự Động x momo"

Hallo ${name}! This is Cơm Pháo lunch group~ Everyday in morning my master will send lunch menu. I'll open registration, take payment and remind paying at the end of the day.

How to order: @Pháo Tự Động [quatity] [note]
Ex: @Pháo Tự Động 2 nhiều thịt ít rau (It means "more meat less veget")

How to pay: Put money in Cơm Nhà Pháo’s money box, tag Pháo Tự Động with an x
Ex: @Pháo Tự Động x`;
    }
}

module.exports.ProactiveBot = ProactiveBot;
