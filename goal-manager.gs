/*
 A script allows you to quickly fetch existing event goals configuration, and just do a few simple tasks:
- lists all your existing event-based goals:
- provides neat dropdowns for adding up new event-based goals
- adds newly created goals to Analytics View via API.

Developed by Dmytro Bulakh / ppchead.com, 2019


*/


function getAccounts() {
  var entitiesResponse = Analytics.Management.AccountSummaries.list()
  listAccounts(entitiesResponse.items)
  var cache = CacheService.getUserCache()
  cache.put('summaries', JSON.stringify(entitiesResponse), 60*60*2)
}

function getProperties() {
  var cache = CacheService.getUserCache()
  var summaries = cache.get('summaries')
  if (!summaries) throw 'GA account data expired, please refresh the account list'
  var entitiesResponse = JSON.parse(summaries)
  //var entitiesResponse = Analytics.Management.AccountSummaries.list()
  var accountId = SpreadsheetApp.getActive().getRangeByName('account').getValue().split(' :: ')[1]
  for (var ind in entitiesResponse.items) {
    if (entitiesResponse.items[ind].id == accountId) break
  }
  listProperties(entitiesResponse.items[ind].webProperties)  
}

function getViews() {
  var cache = CacheService.getUserCache()
  var summaries = cache.get('summaries')
  if (!summaries) throw 'GA account data expired, please refresh the account list'
  var entitiesResponse = JSON.parse(summaries)
  //var entitiesResponse = Analytics.Management.AccountSummaries.list()
  var accountId = SpreadsheetApp.getActive().getRangeByName('account').getValue().split(' :: ')[1]
  var propertyId = SpreadsheetApp.getActive().getRangeByName('property').getValue().split(' :: ')[1]

  for (var pInd in entitiesResponse.items) {
    if (entitiesResponse.items[pInd].id == accountId) break
  }
  for (var vInd in entitiesResponse.items[pInd].webProperties) {
    if (entitiesResponse.items[pInd].webProperties[vInd].id == propertyId) break
  }
  listViews(entitiesResponse.items[pInd].webProperties[vInd].profiles)  
}

function listAccounts (items) {
  var accountCell = SpreadsheetApp.getActive().getRangeByName('account')
  var valueList = ['select account']
  for (var ind in items) {
    var account = items[ind]
    valueList.push(account.name + ' :: ' + account.id)
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(valueList, true).build();
  accountCell.setDataValidation(rule);
  accountCell.setValue('select account')
  clearRange('property')
  clearRange('view')
}


function listProperties (items) {
  var propertyCell = SpreadsheetApp.getActive().getRangeByName('property')
  var valueList = ['select property']
  for (var ind in items) {
    var property = items[ind]
    valueList.push(property.name + ' :: ' + property.id)
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(valueList, true).build();
  propertyCell.setDataValidation(rule);
  propertyCell.setValue('select property')
  clearRange('view')
}

function listViews (items) {
  var viewCell = SpreadsheetApp.getActive().getRangeByName('view')
  var valueList = ['select view']
  for (var ind in items) {
    var view = items[ind]
    valueList.push(view.name + ' :: ' + view.id)
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(valueList, true).build();
  viewCell.setDataValidation(rule);
  viewCell.setValue('select view')
}

function onEdit(e) {
  function sameRange(range1, range2) {
    return (range1.getSheet().getName() == range2.getSheet().getName()) && (range1.getA1Notation() == range2.getA1Notation())
  }
  var editRange = e.range
  try {
    var accountRange = SpreadsheetApp.getActive().getRangeByName('account')
    var propertyRange = SpreadsheetApp.getActive().getRangeByName('property')
    var viewRange = SpreadsheetApp.getActive().getRangeByName('view')
    if (sameRange(editRange, accountRange)) {
      getProperties()
    }
    if (sameRange(editRange, propertyRange)) {
      getViews()
    }
  } catch (e) {
    var ui = SpreadsheetApp.getUi();
    ui.alert(e)
    var logSheet = SpreadsheetApp.getActive().getSheetByName('logs')
    logSheet.appendRow([e])
  }
}

function clearRange(name) {
  var range = SpreadsheetApp.getActive().getRangeByName(name)
  if (range) range.clear().clearDataValidations()
}

function setHeader () {
  var headerRange = SpreadsheetApp.getActive().getRangeByName('goal_header')
  var header_ids = ["name", "id"]
  var eventParams = ["category condition", "category value", "action condition", "action value", "label condition", "label value", "value condition", "value value"]
  var optParam = ["use value"]
  var rangeValues = []
  rangeValues.push.apply(rangeValues, header_ids)
  rangeValues.push.apply(rangeValues, eventParams)
  rangeValues.push.apply(rangeValues, optParam)
  headerRange.setValues([rangeValues])
}


function sendNewGoals() {
  var ui = SpreadsheetApp.getUi()
  var headerRange = SpreadsheetApp.getActive().getRangeByName('goal_header')
  var sheet = headerRange.getSheet()
  var cache = CacheService.getUserCache()
  var avString = cache.get('availableIds')
  
  if (!cache.get('availableIds')) throw "No goal data available. Please, refresh goal data"
  var available = JSON.parse(avString)
  
  var used = cache.get('usedEventGoals')
  Logger.log('from cache usedEventGoals %s', used)
  used = (used) ? JSON.parse(used) : 0.0
  
  //var available = []
  var newGoalsStartRow = headerRange.getRow() + used + 1
  var lastRow = sheet.getLastRow()
  Logger.log('New goals starts at %s', newGoalsStartRow)
  Logger.log('has %s new rows', lastRow - newGoalsStartRow + 1)
  var newGoalsRows = sheet.getRange(newGoalsStartRow, 1, lastRow - newGoalsStartRow + 1, 11 ).getValues()
  Logger.log('newGoalsRows length %s', newGoalsRows.length)
  var added = 0

  for (var i in newGoalsRows) {
    var row = newGoalsRows[i]
    added += sendRow(row) 
  }
  var failed = newGoalsRows.length - added
  ui.alert('%s new goals created.'.replace('%s', added) + (failed > 0 ? ' ' + failed + ' goals failed.': '') )
  getAvailableIds()
}

function sendRow(row) {
  try {
    var resource = constructGoal(row)
    var creds = getCreds()
    var response = Analytics.Management.Goals.insert(resource, creds.accountId, creds.propertyId, creds.viewId)
  } catch (e) {    
    Logger.log('row failed\n%s', JSON.stringify(row, null, 2))
    return 0
  }
  return 1
}

function test() {
  var cache = CacheService.getUserCache()
  
  Logger.log(cache.get('usedEventGoals'))
  
  /*

  var headerRange = SpreadsheetApp.getActive().getRangeByName('goal_header')
  var lastRow = headerRange.getSheet().getLastRow()
  var row = headerRange.getSheet().getRange(lastRow, 1, 1, 11).getValues()[0]
  var resource = constructGoal(row)
  Logger.log(JSON.stringify(resource, null, 2))
  var creds = getCreds()
  Logger.log(JSON.stringify(creds, null, 2))
  var response = Analytics.Management.Goals.insert(resource, creds.accountId, creds.propertyId, creds.viewId)
  Logger.log(JSON.stringify(response, null, 2))
  */
}

function addTemplateRow() {
  var header_ids = ["name", "id"]
  var eventParams = ["category condition", "category value", "action condition", "action value", "label condition", "label value", "value condition", "value value"]
  var optParam = ["use value"]
  var rangeValues = []
  rangeValues.push.apply(rangeValues, header_ids)
  rangeValues.push.apply(rangeValues, eventParams)
  rangeValues.push.apply(rangeValues, optParam)
  function getPosition (val) {
    return rangeValues.indexOf(val) + 1
  }
  var cache = CacheService.getUserCache()
  var avString = cache.get('availableIds')
  if (!cache.get('availableIds')) throw "No goal data available. Please, refresh goal data"
  var availabe = JSON.parse(avString)
  var headerRange = SpreadsheetApp.getActive().getRangeByName('goal_header')
  var sheet = headerRange.getSheet()
  var lastRow = sheet.getLastRow()
  var usedGoals = lastRow - headerRange.getRow()
  Logger.log('usedGoals %s', usedGoals)
  var usedIds = []
  if (usedGoals > 0 ) {
    var goalRows = sheet.getRange(headerRange.getRow() + 1, 1, lastRow, rangeValues.length).getValues()
    usedIds = goalRows.map(function (row) { return row[rangeValues.indexOf('id')]})
  }
  for (var i in usedIds) {
    if (availabe.indexOf(usedIds[i]) != -1) availabe.splice(availabe.indexOf(usedIds[i]), 1)
  }
  var goalRow = rangeValues.map(function (item) {return ""})
  goalRow[getPosition('id') - 1] = availabe.pop()
  var newRowRange = sheet.getRange(lastRow + 1, 1, 1, rangeValues.length)
  newRowRange.setValues([goalRow]).setBackground('moccasin')
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(['REGEXP', 'BEGINS_WITH', 'EXACT'], true).build()
  for (var i in rangeValues) {
    var param = rangeValues[i]
    if (param.match('condition')) {
      var cell =  sheet.getRange(lastRow + 1, getPosition(param))
      cell.setDataValidation(rule);
    }
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(availabe.concat([goalRow[getPosition('id') - 1]]), true).build()
  cell =  sheet.getRange(lastRow + 1, getPosition('id')).setDataValidation(rule)
  rule = SpreadsheetApp.newDataValidation().requireValueInList([ 'LESS_THAN', 'GREATER_THAN', 'EQUAL'], true ).build()
  cell =  sheet.getRange(lastRow + 1, getPosition('value condition')).clearDataValidations().setDataValidation(rule)
}

function getAvailableIds () {
  setHeader()
  var cache = CacheService.getUserCache()
  var eventParams = ["category condition", "category value", "action condition", "action value", "label condition", "label value", "value condition", "value value"]
  var creds = getCreds()
  if (!creds) throw 'Please select proper view IDs'
  var goalsResponse = Analytics.Management.Goals.list(creds.accountId, creds.propertyId, creds.viewId)
  var used = goalsResponse.items.reduce(function (acc, goal) { acc[goal.id] = goal; return acc }, {})
  //var used = goalsResponse.items
  //Logger.log(used)
  var usedEventGoals = []
  var availableIds =[]
  for (var id = 1; id < 21; id++)  {
    if (!used[id]) availableIds.push(id)
    if (used[id] && used[id].type == 'EVENT') usedEventGoals.push(id)
  }
  cache.put('usedEventGoals', usedEventGoals.length)
  cache.put('availableIds', JSON.stringify(availableIds), 60*60*2)
  //goals_left
  SpreadsheetApp.getActive().getRangeByName('goals_left').setValue(availableIds.length + ' goals left')
  var headerRange = SpreadsheetApp.getActive().getRangeByName('goal_header')
  var sheet = headerRange.getSheet()
  var lastRow = sheet.getLastRow()
  if ( headerRange.getRow() < lastRow) sheet.getRange(headerRange.getRow() +1 , 1, lastRow, sheet.getLastColumn()).clear().clearDataValidations()
  var rows = []
  for (var id in used) {
    var goal = used[id]
    if (goal.type == "EVENT") {
      var row = [], goalProps = goal.eventDetails.eventConditions
      row.push(goal.name)
      row.push(goal.id)
      var rowObj = eventParams.reduce(function (acc, param) { acc[param] = ""; return acc }, {} )
      for (var k in goalProps) {
        var contitionParam = goalProps[k].type.toLowerCase() + " condition"
        rowObj[contitionParam] = goalProps[k].matchType
        var valueParam =  goalProps[k].type.toLowerCase() + " value"
        rowObj[valueParam] = goalProps[k].expression
      }
      for (var i in eventParams) {
        var param = eventParams[i]
        row.push(rowObj[param])
      }
      row.push(goal.eventDetails.useEventValue)
      rows.push(row)
    }
  }
  if (rows.length > 0) {
    sheet.getRange(headerRange.getRow() +1 , 1, rows.length, rows[0].length).setValues(rows).setBackground("mediumturquoise");
  }
}

function constructGoal(row) {
  var header_ids = ["name", "id"]
  var eventParams = ["category condition", "category value", "action condition", "action value", "label condition", "label value", "value condition", "value value"]
  var optParam = ["use value"]
  var rangeValues = []
  rangeValues.push.apply(rangeValues, header_ids)
  rangeValues.push.apply(rangeValues, eventParams)
  rangeValues.push.apply(rangeValues, optParam)
  function getPosition (val) {
    return rangeValues.indexOf(val)
  }
  var string = "", boolean = true, long = 0.0
  var creds = getCreds()
  if (!creds) throw 'Please select proper view IDs'
  var resource = {
    "kind": "analytics#goal",
  //  "accountId": creds.accountId,
  //  "webPropertyId": creds.propertyId,
  //  "profileId": creds.viewId,
    "name": string,
    "active": true,
    "type": "EVENT",
    "eventDetails": {
      "useEventValue": boolean,
      "eventConditions": [
        /*
        {
        "type": string,
        "matchType": string,
        "expression": string,
        "comparisonType": string,
        "comparisonValue": long
        }
        */
      ]
    }
  }
  
  var conditions = {
    'category': null,
    'action': null,
    'label': null,
    'value': null
  }
  
  for (var i in eventParams) {
    var param = eventParams[i]
    var paramType = param.split(' ')[0]
    var paramKind = param.split(' ')[1]
    if (row[getPosition(param)] != '') {
      if (paramType != 'value') {
        conditions[paramType] = conditions[paramType] || { 'type':paramType.toUpperCase() }
        if (paramKind == 'condition' ) {
          conditions[paramType].matchType = row[getPosition(param)]
        } else {
          conditions[paramType].expression = row[getPosition(param)]
        }
      } else {
        if (paramKind == 'condition' ) {
          conditions[paramType].comparisonType = row[getPosition(param)]
        } else {
          conditions[paramType].comparisonValue = row[getPosition(param)]
        }
      }
    }
  }
  for (var cat in conditions) {
    if (conditions[cat]) resource.eventDetails.eventConditions.push(conditions[cat])
  }
  for (var i in header_ids) {
    var param = header_ids[i]
    if (row[getPosition(param)] == '') throw 'no %s specified in Goal Row'.replace('%s', param)
    resource[param] = row[getPosition(param)]
  }
  return resource
}


function getCreds() {
  var accountId = SpreadsheetApp.getActive().getRangeByName('account').getValue().split(' :: ')[1]
  
  if (accountId == 'select account' || accountId == '') return null
  
  var propertyId = SpreadsheetApp.getActive().getRangeByName('property').getValue().split(' :: ')[1]
  if (propertyId == 'select property' || propertyId == '') return null
  var viewId = SpreadsheetApp.getActive().getRangeByName('view').getValue().split(' :: ')[1]
  if (viewId == 'select view' || viewId == '') return null
  return {
    "accountId": accountId,
    "propertyId": propertyId,
    "viewId": viewId
  }
}



/*


{
  "kind": "analytics#goal",
  "accountId": string,
  "webPropertyId": string,
  "profileId": string,
  "name": string,
  "active": boolean,
  "type": "EVENT",
  "eventDetails": {
    "useEventValue": boolean,
    "eventConditions": [
      {
        "type": string,
        "matchType": string,
        "expression": string,
        "comparisonType": string,
        "comparisonValue": long
      }
    ]
  }
}

*/


