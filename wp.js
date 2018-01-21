//┌────────────── ИМПОРТ И СИНХРОНИЗАЦИЯ WORDPRESS БЛОГОВ С БЛОГАМИ НА GOLOS
//│ ┌──────────── Приложение работает на nodejs 
//│ │ ┌────────── Установить: npm install --save wordpress-rest-api
//│ │ │ ┌──────── Установить: npm install steem
//│ │ │ │ ┌────── Настроить: расписание импорта по CRON http://help.ubuntu.ru/wiki/cron
//│ │ │ │ │ 
//│ │ │ │ │ 
//│ │ │ │ │ 

const ga = require("golos-addons");

const global = ga.global;
const steem = require("steem");

global.initApp("wordpress");

const log = global.getLogger("wp");

const WP = require('wordpress-rest-api');

const CONFIG = global.CONFIG;



// НАСТРОЙКИ
// Ниже необходимо указать путь до вашего wp-json директивы вашего WORDPRESS 
const wp = new WP({
    endpoint: CONFIG.wp_endpoint
});


// Формат WP записи которая опубликует пост в golos.io в режиме "отказ от выплат"
// Указано link - ссылка. Если хотите опубликовать запись с отказом от выплаты - выбирайте в WP указанный ниже формат
// Если вы ошиблись при размещении поста - вы можете оперативно отредактировать его в вп с другим форматом -
// Это изменить формат и на голосе. 
const wpFormatForNoReward = CONFIG.wpFormatForNoReward;

// Стандартные форматы в WP: standard,aside,link,quote,image,video,gallery,status,video,audio,chat
// https://codex.wordpress.org/Post_Formats


// Формат WP записи которая опубликует пост в режиме "100% в силе голоса"
const wpFormatForAllInpower = CONFIG.wpFormatForAllInpower;



// Укажите s postLimit сколько последних постов проверять на wordpress блоге. 
// Разунмно комбинируйте это со значением globalInterval - не указывайте слишком большее количество постов при слишком коротком интервале
// Если блог-донор обновляется редко - указывайте неблольшой значение.
const postLimit = CONFIG.postLimit;

// ИНТЕРВАЛ РАЗМЕЩЕНИЯ ПОСТОВ
// Используйте разумно из расчета расписания указанного вами в CRON, а так же помните, что мимнимальный интервал
// должен стоять мимним 5 минут - голос не разрешает размещать посты чаще. 
const postInterval = CONFIG.postInterval;


// ПОДКЛЮЧЕНИЕ К GOLOS
// wss://ws.golos.io - В примере ниже указан универсальный вариант главной публичной ноды голоса 
// Если скрипт будет запускаться на сервере с вашей собственной нодой, вы можете указать:
// ws://localhost:9090 - порт 9090 у вас может быть другим, он укащан в конфиге ноды
// Вариант с localhost подойдет в случае отсутствия доступа к главной ноде голоса
// Кроме этого вы можете указать ноду для STEEMIT !

// golos.config.set('websocket','ws://localhost:9090');

steem.api.setOptions({ url: "https://api.steemit.com" })

// Некоторые строки,такие как теги, категории, ссылки в wordpress могут быть на русском, но поскольку golos.io не понимает кириллические теги
// Ниже создадим функцию, которая будет транслитировать кириллицу в латиницу.
// Напротив каждой кириллической буквы мы поместим ее латиницкий аналог в формате голоса:	
const cyrTag = () => {
    // Таблица транслитирации в том виде, в котором она принята на golos.io
    const _associations = {
        "а": "a",
        "б": "b",
        "в": "v",
        "ґ": "g",
        "г": "g",
        "д": "d",
        "е": "e",
        "ё": "yo",
        "є": "ye",
        "ж": "zh",
        "з": "z",
        "и": "i",
        "і": "i",
        "ї": "yi",
        "й": "ij",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "x": "kh",
        "ц": "cz",
        "ч": "ch",
        "ш": "sh",
        "щ": "shch",
        "ъ": "xx",
        "ы": "y",
        "ь": "x",
        "э": "ye",
        "ю": "yu",
        "я": "ya",
        "ґ": "g",
        "і": "i",
        "є": "e",
        "ї": "i"
    };

    return {
        transform: transform
    }

    function transform(str, spaceReplacement) {
        if (!str) {
            return "";
        }
        let new_str = '';
        let ru = ''
        for (let i = 0; i < str.length; i++) {
            let strLowerCase = str[i].toLowerCase();

            if (strLowerCase === " " && spaceReplacement) {
                new_str += spaceReplacement;

                continue;
            }

            if (!_associations[strLowerCase]) {
                new_str += strLowerCase;
            } else {
                new_str += _associations[strLowerCase];
                // Если в теге найдены русские символы - стало быть нам нужно добавить префикс ru-- для публикации на голосе
                ru = 'ru--';
            }
        }
        return ru + new_str;
    }
};

// Теперь мы сможем транслитировать теги подобным образом: cyrTag().transform('Тег на русском', "-")) 

async function getPosts() {
    return new Promise((resolve) => {
        wp.posts()
            .perPage(postLimit)
            .embed()
            .get(function (err, posts) {
                if (err) {
                    console.log('Ошибка wordpress', err)
                    throw err;
                }

                const g = []
                for (let post of posts) {
                    log.debug("found post", post.title['rendered']);
                    g.push({
                        title: post.title['rendered'],
                        content: post.content['rendered'],
                        permlink: post.slug, // Если на вашем WP русские permlink воспользуйтесь транслитирацией: cyrTag().transform(post.slug,"-")
                        status: post.status,
                        update: post.modified_gmt,
                        time: post.date_gmt,
                        tags: post._embedded['wp:term'][1],
                        topic: post._embedded['wp:term'][0][0].name,
                        author: post._embedded['author'][0].slug,
                        thumb: (typeof post._embedded['wp:featuredmedia'] === 'undefined') ? '' : post._embedded['wp:featuredmedia'][0].source_url,
                        embedded: post._embedded,
                        format: post.format
                    })
                }

                resolve(g);
            });
    });
}

const t = 1000;

async function doPost(post) {
    const tags = [];

    for (let tag of post.tags) {
        tags.push(cyrTag().transform(tag['name'], '-'))
    }

    const topic = cyrTag().transform(post.topic, '-')
    const author = CONFIG.authors[post.author];

    if (!author) {
        log.warn("неизвестный автор", post.author);
        return;
    }

    // Нужно проверить блог автора на golos.io на предмет наличия поста c такой же ссылкой и если такой пост уже есть:
    // Проверим нуждается он в обновлении или нет. Если на golos актуальная версия поста - пропустим этот и перейдем к следующему посту
    const permlink = post.permlink

    log.info("обрабатываем пост", author.login, permlink);

    let content = await steem.api.getContentAsync(author.login, permlink);
    if (content.permlink != permlink) {
        content = null;
    }

    let isNew = false;
    let isUpdate = false;
    if (content) {
        // Проверяем когда было последнее обновление этого поста на голосе
        const golosTime = Date.parse(content.last_update) / t

        // Проверяем когда было последние обновление поста на WP
        const wpTime = Date.parse(post.update) / t

        // isUpdate = true если пост с такой ссылкой существует, но версия на WP свежее
        const isUpdate = content.permlink === post.permlink && golosTime < wpTime
    } else {
        isNew = true;
    }
    log.debug("isNew", isNew, "isUpdate", isUpdate);

    // Осуществляем постинг в голос если такого поста не было ИЛИ если на WP свежая редакция поста - заменим ею старый пост на golos
    if (isNew || isUpdate) {
        log.info("Публикация")

        //  0.000 GBG для отказа. 
        const maxAcceptedPayout = (post.format === wpFormatForNoReward) ? '0.000 SBD' : '1000000.000 SBD';
        // 10000 для 50%/50% или 0 для 100% в СГ
        const percentSteemDollars = (post.format === wpFormatForAllInpower) ? 0 : 10000;

        // В этот массив мы запишем теги, превью, название приложения и формат данных. 
        const jsonMetadata = {
            "tags": tags,
            "image": [
                post.thumb
            ],
            // Как хороший тон - ккажем наименование нашего приложения, оно будет отображаться в json metadata
            "app": "Wordpress importer (vik,ropox's version)",
            "format": "html"
        }

        if (isUpdate) {
            log.info("Обновление поста:", post.title)
        } else {
            log.info("Создание поста", post.title);
        }

        if (global.broadcast) {
            // Размещение поста
            await steem.broadcast.commentAsync(
                author.wif,
                '',
                topic,
                author.login,
                permlink,
                post.title,
                post.content,
                jsonMetadata);
        } else {
            log.info("no broadcast, no post",
                '',
                topic,
                author.login,
                permlink,
                post.title,
                post.content,
                jsonMetadata);
        }

        // Установка параметров выплат для поста, отправляем с небольшой отсрочкой во избежание ошибок
        if (!isUpdate) {
            if (global.broadcast) {
                await steem.broadcast.commentOptionsAsync(
                    author.wif,
                    author.login,
                    permlink,
                    maxAcceptedPayout,
                    percentSteemDollars,
                    true,
                    true,
                    []);
            } else {
                log.info("no broadcast, no comment options",
                    author.login,
                    permlink,
                    maxAcceptedPayout,
                    percentSteemDollars            
                );
            }
        }
    }
}

async function run() {

    while (true) {
        try {
            const posts = await getPosts();

            log.info("Начало работы, постов в очереди", posts.length);
            log.debug(posts);

            for (let p of posts) {
                await doPost(p);
            }
        } catch (e) {
            console.log("error in main loop", e);
        }
        await global.sleep(postInterval);
    }
}


run();
