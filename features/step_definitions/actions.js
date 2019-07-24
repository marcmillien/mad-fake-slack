const expect = require('expect');
const scope = require('./support/scope');
const selectors = require('./selectors');
const pages = require('./pages');
const { user } = require('./support/services');
const { dbManager } = require('../../routes/managers');
const { CustomJSONSchemaValidator } = require('./support/validators');
const Validator = CustomJSONSchemaValidator(require('jsonschema').Validator);
const jsonSchemaValidator = new Validator();
const Promise = require('bluebird');

const VIEWPORT = [1920, 1080];

function groupBy(list, keyGetter) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyGetter(item);
    const collection = map.get(key);
    if (!collection) {
      map.set(key, [item]);
    } else {
      collection.push(item);
    }
  });
  return map;
}

function checkIsUserRegistered(name) {
  if (!scope.context.appUsers[name]) {
    throw new Error(`No registered users with name ${name} to start`);
  }
}

async function initBrowser() {
  if (!scope.browser) {
    const useSandbox = process.env.USE_SANDBOX;
    const headless = (process.env.HEADLESS === undefined ? 'true' : process.env.HEADLESS).trim().toLowerCase() === 'true';
    const slowMo = parseInt((process.env.SLOW_MO || '0').trim(), 10);
    const dumpio = !!process.env.DUMPIO;
    const executablePath = process.env.EXECUTABLE_BROWSER_PATH || 'google-chrome-stable';
    const useRemoteDebug = (process.env.USE_REMOTE_DUBUG === undefined ? 'true' : process.env.USE_REMOTE_DUBUG).trim().toLowerCase() === 'true';

    const args = [
      `--window-size=${VIEWPORT}`
    ];
    if (useRemoteDebug) {
      args.push(
        '--remote-debugging-address=0.0.0.0',
        '--remote-debugging-port=9222'
      );
    }
    if (!useSandbox) {
      args.push('--no-sandbox', '--disable-setuid-sandbox');
    }
    scope.browser = await scope.driver.launch({
      args,
      handleSIGINT: true,
      executablePath,
      headless,
      slowMo,
      dumpio
    });
  }

  return scope.browser;
}

async function visitPage(currentPageName) {
  await initBrowser();
  scope.context.currentSelectors = selectors[currentPageName];
  scope.context.currentPage = await scope.browser.newPage();
  await scope.context.currentPage.setRequestInterception(true);
  await scope.context.currentPage.setExtraHTTPHeaders({
    'Accept-Language': scope.locale.language[0]
  });

  await scope.context.currentPage.evaluateOnNewDocument((locale) => {
    Object.defineProperty(navigator, 'language', {
      get() {
        return locale.language;
      }
    });

    Object.defineProperty(navigator, 'languages', {
      get() {
        return locale.languages;
      }
    });

    const [firstLang] = locale.language;
    Intl.DateTimeFormat = () => ({
      resolvedOptions: () => ({
        calendar: 'gregory',
        day: 'numeric',
        locale: firstLang,
        month: 'numeric',
        numberingSystem: 'latn',
        timeZone: locale.timeZone,
        year: 'numeric'
      })
    });
  }, scope.locale);

  scope.context.currentPage.on('request', async request => {
    const interceptRequests = scope.interceptRequests;
    const url = request.url();
    if (interceptRequests[url]) {
      request.respond(interceptRequests[url]);
    } else {
      request.continue();
    }
  });

  scope.context.currentPage.setViewport({
    width: VIEWPORT[0],
    height: VIEWPORT[1]
  });

  const urlPath = pages[currentPageName];
  const url = `${scope.host}${urlPath}`;
  const visit = await scope.context.currentPage.goto(url, {
    waitUntil: 'networkidle2'
  });
  return visit;
}

function setLanguages(langs = ['en-US', 'en']) {
  const [language] = langs;
  scope.locale.languages = langs;
  scope.locale.language = [language];
}

function setTimezone(timeZone) {
  scope.locale.timeZone = timeZone;
}

async function waitForNavigation() {
  await scope.context.currentPage.waitForNavigation();
}

async function waitForUrl(pageName) {
  const expecetedUrl = pages[pageName];
  const url = await scope.context.currentPage.url();
  expect(url).toEqual(`${scope.host}${expecetedUrl}`);
}

async function waitForText(text) {
  await scope.context.currentPage.waitForXPath(
    `//*[contains(normalize-space(string(.)), '${text}')]`
  );
}

async function waitForElementHides(elementType, elementName) {
  const selector = scope.context.currentSelectors[elementType][elementName];
  await scope.context.currentPage.waitForXPath(selector, {
    hidden: true
  });
}

async function wait(ms) {
  await scope.context.currentPage.waitFor(ms);
}

async function goToUrl(url) {
  return scope.context.currentPage.goto(url, {
    waitUntil: 'networkidle2'
  });
}

async function reloadPage() {
  await scope.context.currentPage.reload();
}

function loadPageSelectors(currentPageName) {
  scope.context.currentSelectors = selectors[currentPageName];
}

function interceptRequest(url, response) {
  scope.interceptRequests[url] = response;
}

async function getText(selectorName) {
  await initBrowser();
  const selector = scope.context.currentSelectors[selectorName];
  await scope.context.currentPage.waitForSelector(selector, { visible: true });
  return scope.context.currentPage.$eval(selector, element => Array.from(element.textContent.matchAll(/\S+/g)).join(' '));
}

async function hasElement(containerSelectorName, elementSelectorName) {
  await initBrowser();
  const containerSelector = scope.context.currentSelectors[containerSelectorName];
  const elementSelector = scope.context.currentSelectors[elementSelectorName];
  return !!scope.context.currentPage.$(`${containerSelector} > ${elementSelector}`);
}

async function countOfElements(containerSelectorName, elementSelectorName) {
  await initBrowser();
  const containerSelector = scope.context.currentSelectors[containerSelectorName];
  const elementSelector = scope.context.currentSelectors[elementSelectorName];
  return scope.context.currentPage.$$eval(`${containerSelector} > ${elementSelector}`, elements => elements.length);
}

async function getTextsBetween(itemsSelector, afterText, beforeText) {
  await initBrowser();
  return scope.context.currentPage.$$eval(itemsSelector, (elements, beginText, endText) => {
    const texts = [];
    let beginTextFound = false;
    // eslint-disable-next-line no-restricted-syntax
    for (let element of elements) {
      const elementTextContent = element.textContent.trim();

      if (elementTextContent === endText) {
        break;
      }

      if (beginTextFound) {
        texts.push(elementTextContent);
      }

      if (elementTextContent === beginText) {
        beginTextFound = true;
      }
    }
    return texts;
  }, afterText, beforeText);
}

function createFakeUser(name, params) {
  try {
    checkIsUserRegistered(name);
  } catch (e) {
    const bot = user.create(params);
    scope.context.appUsers[name] = bot;
  }
}

async function connectFakeUser(name) {
  checkIsUserRegistered(name);
  await scope.context.appUsers[name].start();
}

async function typeText(text, options = { delay: 100 }) {
  await initBrowser();
  await scope.context.currentPage.keyboard.type(text, options);
}

async function pressTheButton(button) {
  await initBrowser();
  const { keyboard } = scope.context.currentPage;
  const keys = button.split('+').map(k => k.trim());
  await Promise.mapSeries(keys.slice(0, -1), key => keyboard.down(key));
  await keyboard.press(keys[keys.length - 1]);
  await Promise.mapSeries(keys.slice(0, -1), key => keyboard.up(key));
}

function getLastIncomingMessageTextForUser(name) {
  checkIsUserRegistered(name);
  const message = scope.context.appUsers[name].getLastIncomingMessage();
  if (!message) {
    throw new Error(`No messages found for user ${name}`);
  }
  return message.text;
}

function getLastIncomingPayloadForUser(name, payloadType) {
  checkIsUserRegistered(name);
  const message = scope.context.appUsers[name].getLastIncomingPayload(payloadType);
  if (!message) {
    throw new Error(`No messages found for user ${name}`);
  }
  return message;
}

async function findElement(options) {
  const page = scope.context.currentPage;
  return page.waitForFunction(({ text, selector: elementSelector }) => {
    if (text) {
      const elements = Array.from(document.querySelectorAll(elementSelector));
      const getTextContent = el => el.textContent
        .replace(/\s+/g, ' ')
        .trim();

      const filterByText = el => getTextContent(el) === text;
      const filterByTextRegexp = el => getTextContent(el).match(text) !== null;

      let selectedFilter = text instanceof RegExp ? filterByTextRegexp : filterByText;
      const elementsWithText = elements.filter(selectedFilter);

      if (elementsWithText.length) {
        return elementsWithText[0];
      }
    } else {
      const htmlElement = document.querySelector(elementSelector);
      if (htmlElement) {
        return htmlElement;
      }
    }
    return false;
  }, {}, options);
}

async function clickOn(selectorName, options = {}) {
  await initBrowser();
  const selector = scope.context.currentSelectors[selectorName];
  if (!selector) {
    throw new Error(`[${clickOn.name}] Selector by name ${selectorName} not found!`);
  }
  const page = scope.context.currentPage;
  const element = await findElement({ selector, ...options });

  return Promise.all([
    page.waitForNavigation(),
    element.click()
  ]);
}

async function getTextByPosition(selectorName, position, attribute = 'textContent', matchRegex = /\s+/g) {
  const FIRST_POSITION = 'first';
  const LAST_POSITION = 'last';
  const page = scope.context.currentPage;
  if (![LAST_POSITION, FIRST_POSITION].includes(position)) {
    throw new Error(`[${getTextByPosition.name}] Invalid value for "position"! Valid values: [${position}]`);
  }
  await initBrowser();
  const selector = scope.context.currentSelectors[selectorName];
  const textContents = await page.$$eval(selector, (elements, attr, regex) => elements.map(el => el[attr].replace(regex, ' ').trim()), attribute, matchRegex);
  return textContents[position === FIRST_POSITION ? 0 : textContents.length - 1];
}

function iterateLastIncomingMessages(userName, rows, cb) {
  const channelNameColumnIndex = 1;
  const messagesByChannels = groupBy(rows, row => row[channelNameColumnIndex]);
  const channelNames = Array.from(messagesByChannels.keys());

  const channelIds = channelNames.reduce((all, name) => {
    const channel = dbManager.db.channels.filter(ch => ch.name === name)[0];
    // eslint-disable-next-line no-param-reassign
    all[name] = channel.id;
    return all;
  }, {});

  const result = [];
  Array.from(messagesByChannels.entries()).forEach(([channelName, channelMessages]) => {
    const messages = scope.context.appUsers[userName].getLastIncomingMessagesByChannelId(channelIds[channelName], channelMessages.length);
    cb(messages, channelMessages);
  });
  return result;
}


function checkIsMessagesReceivedByUserFromChannel(userName, rows) {
  const result = [];
  iterateLastIncomingMessages(userName, rows, (messages, channelMessages) => {
    const texts = messages.map(message => message.text);
    channelMessages.forEach(
      ([message, channel]) => result.push(
        [message, channel, texts.includes(message)]
      )
    );
  });
  return result;
}

function checkIsStatusMessagesReceivedByUserFromChannel(userName, rows) {
  const result = [];
  iterateLastIncomingMessages(userName, rows, (messages, channelMessages) => {
    const types = Array.from(messages.reduce((set, message) => {
      set.add(message.type);
      return set;
    }, new Set()).values());
    channelMessages.forEach(
      ([type, channel]) => result.push(
        [type, channel, types.includes(type)]
      )
    );
  });
  return result;
}

function validateIncomingMessage(messageObject, schemaRows) {
  const { properties, required } = schemaRows.reduce((schema, row) => {
    const propName = row[0];
    const item = { type: row[1] };
    if (row[3]) {
      item.format = row[3];
    }
    // eslint-disable-next-line no-param-reassign
    schema.properties[propName] = item;
    if (row[2] === 'true') {
      schema.required.push(propName);
    }
    return schema;
  }, { properties: {}, required: [] });

  const schema = {
    id: '/IncomingMessage',
    type: 'object',
    properties,
    required
  };

  const validationResult = jsonSchemaValidator.validate(messageObject, schema);
  return validationResult.errors;
}

function resetDb() {
  dbManager.reset();
}

async function waitForAnswer(fn, interval, maxFailCount = 1) {
  return new Promise((resolve, reject) => {
    let failCounter = 0;
    let id;
    function clearResources(timerId) {
      if (timerId) {
        clearTimeout(timerId);
      }
    }
    async function check() {
      try {
        resolve(await fn());
        clearResources(id);
      } catch (e) {
        if (failCounter >= maxFailCount) {
          clearResources(id);
          reject(e);
        }
        failCounter += 1;
      }
    }
    id = setInterval(check, interval);
  });
}

async function sendMessageFrom(userName, channelName, options) {
  const { type } = options;
  const methodsByTypeMap = {
    user_typing() {
      return scope.context.appUsers[userName]
        .sendUserTypingToChannel(channelName);
    },
    message() {
      return scope.context.appUsers[userName]
        .sendTextMessageToChannel(channelName, options.text);
    }
  };
  return methodsByTypeMap[type] && methodsByTypeMap[type]();
}

async function getContentsByParams(options, { position = 'last', attribute = 'textContent', matchRegex = /\s+/g }) {
  return Promise.mapSeries(
    Object.entries(options),
    ([selectorName]) => getTextByPosition(selectorName, position, attribute, matchRegex)
  );
}

module.exports = {
  wait,
  goToUrl,
  getText,
  visitPage,
  reloadPage,
  hasElement,
  waitForUrl,
  waitForText,
  setTimezone,
  setLanguages,
  countOfElements,
  interceptRequest,
  loadPageSelectors,
  waitForNavigation,
  waitForElementHides,
  getTextsBetween,
  createFakeUser,
  connectFakeUser,
  typeText,
  pressTheButton,
  getLastIncomingMessageTextForUser,
  clickOn,
  getTextByPosition,
  checkIsMessagesReceivedByUserFromChannel,
  validateIncomingMessage,
  resetDb,
  waitForAnswer,
  checkIsStatusMessagesReceivedByUserFromChannel,
  getLastIncomingPayloadForUser,
  sendMessageFrom,
  getContentsByParams
};
