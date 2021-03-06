const expect = require('expect');
const Promise = require('bluebird');

const {
  Given,
  When,
  Then
} = require('cucumber');

const actions = require('./actions');
const WithRetryOptions = { wrapperOptions: { retry: 4 }, timeout: 30000 };

Given('I am on {string} page', async (pagePath) => {
  await actions.visitPage(pagePath);
});

Then('I should see {string} in {string}', async (expectedText, selectorName) => {
  const actualText = await actions.getText(selectorName);
  expect(actualText).toStrictEqual(expectedText);
});

Then('I should see {string} in {string} on the {string} position', async (expectedText, selectorName, position) => {
  const actualText = await actions.getTextByPosition(selectorName, position || 'last');
  expect(actualText).toStrictEqual(expectedText);
});

Given('My timezone is {string}', (timezoneName) => {
  actions.setTimezone(timezoneName);
});

Given('Now is the date and time {string}', async (strDateAndTime) => {
  await actions.setTodayDate(strDateAndTime);
});

Given('Now {string} minutes passed', async (minutesCount) => {
  actions.increaseTodayDateByMinutes(Number(minutesCount));
});

Then('I should see following channels between {string} and {string}:', async (afterText, beforeText, dataTable) => {
  const texts = await actions.getTextsBetween('[role="listitem"]', afterText, beforeText);
  expect(texts).toStrictEqual(dataTable.rows().map(row => row[0]));
});

Then('I should see {string} as selected channel', async (channelName) => {
  const actualSelectedChannel = await actions.getText('Selected channel');
  expect(actualSelectedChannel).toStrictEqual(channelName);
});

Then('I should see icon {string} in {string}', async (iconSelectonName, containerSelectorName) => {
  const has = await actions.hasElement(containerSelectorName, iconSelectonName);
  expect(has).toBeTruthy();
});

Then('I should see the following controls in {string}:', async (containerSelectorName, dataTable) => {
  const componentSelectors = dataTable.rows().map(row => row[0]);
  const expectedResults = componentSelectors.map(item => ({ [item]: true }));

  const actualResult = await Promise.mapSeries(componentSelectors, async (selectorName) => {
    const has = await actions.hasElement(containerSelectorName, selectorName);
    return { [selectorName]: has };
  });

  expect(actualResult).toStrictEqual(expectedResults);
});

Then('I should see {string} messages', async (count) => {
  const expectedCount = +count;
  const actualCount = await actions.countOfElements('Messages container', 'Message item');
  expect(actualCount).toStrictEqual(expectedCount);
});

Given('User {string} connected to fake slack using parameters:', async (name, dataTable) => {
  const params = dataTable.rowsHash();
  actions.createFakeUser(name, params);
  await actions.connectFakeUser(name);
});

Given('I type {string}', async (text) => {
  await actions.typeText(text);
});

When('I press the {string} keyboard button', async (buttonName) => {
  await actions.pressTheButton(buttonName);
});

Then('User {string} should receive message {string}', WithRetryOptions, async (userName, expectedMessage) => {
  const message = actions.getLastIncomingMessageTextForUser(userName);
  expect(message).toStrictEqual(expectedMessage);
});

Given('I click on {string} with text {string}', async (selectorName, text) => {
  await actions.clickOn(selectorName, { text });
});

Given('I click on {string} with text {string} without navigation', async (selectorName, text) => {
  await actions.clickOn(selectorName, { text }, true);
});

Then('User {string} should receive messages:', WithRetryOptions, async (userName, dataTable) => {
  const rows = dataTable.rows();
  const expected = rows.map(row => [...row, true]);
  expect(actions.checkIsMessagesReceivedByUserFromChannel(userName, rows)).toStrictEqual(expected);
});

Then('User {string} should receive status messages:', WithRetryOptions, async (userName, dataTable) => {
  const rows = dataTable.rows();
  const expected = rows.map(row => [...row, true]);
  expect(actions.checkIsStatusMessagesReceivedByUserFromChannel(userName, rows)).toStrictEqual(expected);
});

Then('User {string} should receive {string} payload with {string} type:', WithRetryOptions, async (userName, messageDirection, payloadType, dataTable) => {
  const payload = dataTable.rows();
  if (messageDirection === 'incoming') {
    const message = actions.getLastIncomingPayloadForUser(userName, payloadType);
    expect(actions.validateIncomingMessage(message, payload)).toStrictEqual([]);
  }
});

Then('User {string} should receive {string} payload of type {string} with fields:', (userName, messageDirection, payloadType, dataTable) => {
  const rows = dataTable.rows();
  const expected = dataTable.rowsHash();
  delete expected.field;
  if (messageDirection === 'incoming') {
    const message = actions.getLastIncomingPayloadForUser(userName, payloadType);

    const resolve = (path, obj) => {
      return path.split('.').reduce((prev, curr) => {
        return prev ? prev[curr] : null;
      }, obj);
    };

    const actual = rows.reduce((accum, [key]) => {
      // eslint-disable-next-line no-param-reassign
      accum[key] = resolve(key, message);
      return accum;
    }, {});

    expect(actual).toStrictEqual(expected);
  }
});

Given('Fake slack db is empty', () => {
  actions.resetDb();
});

When('User {string} send {string} message to {string} channel', async (userName, messageType, channelName) => {
  await actions.sendMessageFrom(userName, channelName, { type: messageType });
});

When('User {string} send message:', async (userName, dataTable) => {
  const payload = dataTable.rowsHash();
  const { channel, ...options } = payload;
  await actions.sendMessageFrom(userName, channel, options);
});

Given('Now is the date and time {string} for {string} user', (isoDate, userName) => {
  actions.setTodayBotDate(userName, isoDate);
});

Given('Now {string} minutes passed for {string} user', (minutesCount, userName) => {
  actions.increaseTodayBotDateByMinutes(userName, Number(minutesCount));
});

Then('I should see {string} message with:', async (position, dataTable) => {
  const options = dataTable.rowsHash();
  const actualTexts = await actions.getContentsByParams(options, { position });
  expect(actualTexts).toStrictEqual(Object.values(options));
});

Then('I should see {string} multiline message with:', async (position, dataTable) => {
  const options = dataTable.rowsHash();
  const actualTexts = await actions.getContentsByParams(options, { position, attribute: 'innerText', matchRegex: /\s+^[$]/g });
  expect(actualTexts).toStrictEqual(Object.values(options));
});

When('I should see {string} multiline {string} with:', WithRetryOptions, async (position, itemSelectorName, dataTable) => {
  const options = dataTable.rowsHash();
  const lastItem = await actions.getItemContentsByParams(options, itemSelectorName, { position });
  expect(lastItem).toStrictEqual(options);
});

When('I\'m waiting for {string} to be hidden', WithRetryOptions, async (selectorName) => {
  await actions.waitForToBeHidden(selectorName);
});

Given('I\'ll wait a little', async () => {
  await actions.wait(200);
});

Then('Message has the following HTML content at {string} position in {string}:', async (position, selectorName, dataTable) => {
  const data = typeof dataTable === 'string' ? dataTable : dataTable.rows()[0];
  const expectedHtml = Array.isArray(data) ? data[0] : data;
  const actualHtml = await actions.getHtmlByPosition(selectorName, position || 'last');
  expect(actualHtml).toStrictEqual(expectedHtml);
});

Given('I copied the following text to the clipboard:', async (dataTable) => {
  const [firstRow] = dataTable.rows();
  const [text] = firstRow;
  await actions.copyTextToClipboard(text);
});

Given('I memorize the {string} of {string}', async (properyName, selectorName) => {
  await actions.setMemorizeProperty(selectorName, properyName);
});

Then('The {string} with type {string} of the {string} must {string} last', async (propertyName, valueType, selector, equalityValue) => {
  const propValue = await actions.getPropertyValueBySelector(selector, propertyName);
  const prevPropValue = await actions.getMemorizeProperty(selector, propertyName);
  const ValueType = global[valueType];
  expect(ValueType(propValue))[equalityValue](ValueType(prevPropValue));
});

Given('I set the focus on {string}', async (selectorName) => {
  await actions.setFocus(selectorName);
});

Given('I press the {string} keyboard button {string} times', async (buttonNames, times) => {
  await actions.runTimes(times, () => actions.pressTheButton(buttonNames));
});

Given('I set cursor to the {string} position of the text', async (position) => {
  await actions.setTextPositionTo(position);
});

Given('Restart the api server with the following envs:', async (dataTable) => {
  await actions.restartApiServerWithEnvs(dataTable.rowsHash());
});

When('I send {string} request to {string} with conditions', async (httpMethod, url, docString) => {
  const { request, response } = JSON.parse(docString);
  const actualResponse = await actions.makeJsonRequest({
    httpMethod,
    url,
    body: request.body,
    headers: request.headers
  });
  expect(actualResponse).toStrictEqual(response);
});

Then('I restart the server with default envs', () => {
  return actions.restartApiServer();
});

Given('I send {string} to chat', async (text) => {
  await actions.typeText(text);
  await actions.pressTheButton('Enter');
});

When('I reload the page', async () => {
  await actions.reloadPage();
});

Given('I type multiline message:', async (docString) => {
  await actions.typeMultilineMessage(docString);
});

Then('I should not see {string}', async (elementSelectorName) => {
  await actions.shouldNotSee(elementSelectorName);
});
