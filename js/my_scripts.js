var DEBUG = false;
var SAVE_STATS_DATA = false;
var apiData = {}, statData = {totals:{},stats:{},data:{}}, svcData=[];
var apiCallCounter = 0;
function isObject(value) {
  return value && typeof value === 'object' && value.constructor === Object;
}
function commaFormat(i) {return i.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
function byteFormat(i) {
  var unit = ",KILO,MEGA,GIGA,TERA,PETA,EXA".split(",");
  var power = Math.trunc((i.toString().length-1)/3);
  var num = (power==0) ? i : ((i / (1000**power)).toFixed(3));
  return `${num} ${unit[power].substr(0,1)}B`;
}
function newDate(p,b) {
  b = (typeof b == "boolean") ? b : false;
  let d = new Date(p);
  return (b) ? (d.toISOString().substr(0,10)) : d;
}
function elapsedDays() {
  return (newDate($('#toDate').val()) - newDate($('#fromDate').val())) / (24 * 3600 * 1000) + 1;
}
function daysFromNow(days) {
  if (typeof days != "number") days = 0;
  var today = new Date();
  today.setDate(today.getDate() + days);
  return today;
}
function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function bootstrapAlert(txtTitle, txtBody) {
  $('.modal-title').html(txtTitle);
  $('.modal-body').html(txtBody);
  $('#modal-button').click();
}
function makeApiXhr(method, url, data, postProcessFunction, extraHeaders) {
  if (DEBUG) console.log(`makeApiXhr(): ${url}`);
  if (typeof extraHeaders == "undefined") extraHeaders = {};
	var xhr = new XMLHttpRequest();
	xhr.open(method, url, true);
  xhr.setRequestHeader("Fastly-Debug", 1);
  xhr.setRequestHeader("Fastly-Key", apiData['api_key']);
	//xhr.setRequestHeader("Accept", "application/vnd.api+json");
	xhr.setRequestHeader("Accept", "application/json");
	//if (method == "POST") xhr.setRequestHeader("Content-Type", "text/plain");
  /*
  if (extraHeaders)
    Object.keys(extraHeaders).forEach(key => {
      xhr.setRequestHeader(key, extraHeaders[key]);
    });
  */
	xhr.onreadystatechange = function() { if (xhr.readyState === 4) postProcessFunction(xhr); };
	if (method == "POST") { xhr.send(data); } else { xhr.send(); }
}
function xhrError(errMsgs,statusCode) {
  $('[data-dismiss="modal"]').click(function(){
    stateTransition();
    $('[data-dismiss="modal"]').off('click');
  })
  bootstrapAlert('XHR Error',`${(statusCode in errMsgs) ? errMsgs[statusCode] : "Uknown Error"}<br>(HTTP Response Code = ${statusCode})`);
}
function getServiceInfo(nextState) {
  var url = `https://${location.hostname}/service/SERVICE_ID?service_id=${apiData.service_id}`;
  makeApiXhr("GET", url, null, function(xhr) {
		if (xhr.status === 200) {
      var responseData = JSON.parse(xhr.responseText);
      //console.log(JSON.stringify(responseData,null,"  "));
      svcData.push( {
        service_id:apiData.service_id,
        service_name:responseData.name
      } );
      apiData.customer_id = responseData.customer_id;
      $('#customerId').val(apiData.customer_id);
      stateTransition(nextState);
    } else {
      xhrError({401:'Bad API Key',404:'Bad Service ID'},xhr.status);
      console.log(`getServiceInfo():  HTTP Error (Status = ${xhr.status})`);
    }
	});
}
function getCustomerServices(nextState) {
  var url = `https://${location.hostname}/customer/CUSTOMER_ID/services?customer_id=${apiData.customer_id}`;
  makeApiXhr("GET", url, null, function(xhr) {
		if (xhr.status === 200) {
      var responseData = JSON.parse(xhr.responseText);
      //console.log(JSON.stringify(responseData,null,"  "));
      responseData.forEach( (oSvc) => svcData.push( {
        service_id:oSvc.id,
        service_name:oSvc.name
      } ) );
      //console.log(JSON.stringify(svcData,null,"  "));
      stateTransition(nextState);
    } else {
      xhrError({401:'Bad API Key',404:'Bad Customer ID'},xhr.status);
      console.log(`getCustomerInfo():  HTTP Error (Status = ${xhr.status})`);
    }
	});
}
function getCustomerInfo(nextState) {
  var url = `https://${location.hostname}/customer/CUSTOMER_ID?customer_id=${apiData.customer_id}`;
  makeApiXhr("GET", url, null, function(xhr) {
		if (xhr.status === 200) {
      var responseData = JSON.parse(xhr.responseText);
      //console.log(JSON.stringify(responseData,null,"  "));
      apiData.customer_name = responseData.name;
      $('#customerName').val(apiData.customer_name);
      stateTransition(nextState);
    } else {
      xhrError({401:'Bad API Key',404:'Bad Customer ID'},xhr.status);
      console.log(`getCustomerInfo():  HTTP Error (Status = ${xhr.status})`);
    }
	});
}
function getServiceStats(fieldName, nextState) {
  var toDatePlusOne = newDate(addDays(apiData.to_date,1),true),
      url = `https://${location.hostname}/stats/service/SERVICE_ID/field/FIELD_NAME?service_id=${apiData['service_id']}&field_name=${fieldName}\&from=${apiData['from_date']}\&to=${toDatePlusOne}\&by=day`;
  //url += ((url.includes("?")) ? "&" : "?") + "HTTPBIN=1";
  makeApiXhr("GET", url, null, function(xhr) {
		if (xhr.status === 200) {
      var responseData = JSON.parse(xhr.responseText);
      //console.log(JSON.stringify(responseData,null,"  "));
      if (SAVE_STATS_DATA) {
        if (!(apiData.service_id in statData.data)) statData.data[apiData.service_id] = {};
        statData.data[apiData.service_id][fieldName] = Object.assign({}, responseData.data);
      }
      let total = 0;
      responseData.data.forEach((o) => { total += o[fieldName]; });
      statData.stats[apiData.service_id][fieldName] = total;
      ///console.log(`${apiData.service_id} / ${fieldName}: ${total}`)
      stateTransition(nextState);
    } else {
      xhrError({401:'Bad API Key',404:'Bad Service ID'},xhr.status);
      console.log(`getServiceStats():  HTTP Error (Status = ${xhr.status})`);
    }
	});
}
function getUserInfo(nextState) {
  var url = `https://${location.hostname}/current_user`;
  makeApiXhr("GET", url, null, function(xhr) {
		if (xhr.status === 200) {
      var responseData = JSON.parse(xhr.responseText);
      //console.log(JSON.stringify(responseData,null,"  "));
      apiData.user_role = responseData.role;
      $('#userRole').val(apiData.user_role);
      stateTransition(nextState);
    } else {
      xhrError({401:'Bad API Key',404:'Bad Service ID'},xhr.status);
      console.log(`getUserInfo():  HTTP Error (Status = ${xhr.status})`);
    }
	});
}
function csvFormat(arrIn) {
  if (!Array.isArray(arrIn)) arrIn = [arrIn];
  let arrOut = [];
  arrIn.forEach(function(item){arrOut.push(`"${item.replace(/"/g,'""')}"`);});
  return arrOut.join(",");
}
function getCsvData() {
  let csvData = [], csvDataRow = [], checkedRowClasses = [];
  $('#service-data thead tr th[csv]').each(function(){
    //csvDataRow.push( csvFormat( $(this).text() ) );
    // Get first text node only to skip sort link labels...
    csvDataRow.push( csvFormat( $(this)[0].childNodes[0].nodeValue ) );
  });
  csvData.push(csvDataRow.join(','));
  
  $('#service-data tbody .select-service:checked').each(function(){
    checkedRowClasses.push($(this).parent().parent().attr('class'));
  });
  
  checkedRowClasses.forEach(function(checkedRowClass){
    csvDataRow=[];
    $(`#service-data tbody .${checkedRowClass} td[csv]`).each(function(){
      csvDataRow.push( csvFormat( $(this).text() ) );
    });
    csvData.push(csvDataRow.join(','));
  });
  
  if (apiData.export_footer) {
    csvData.push("");
    csvData.push("");
    csvData.push(csvFormat(["Customer ID:",`${$('#customerId').val()}`]));
    csvData.push(csvFormat(["Customer Name:",`${$('#customerName').val()}`]));
    csvData.push(csvFormat(["Services Selected:",`${$('#service-data tbody tr td input:checked').length} of ${$('#service-data tbody tr').length}`]));
    csvData.push(csvFormat(["Total Origin Bandwidth:",`${$('#service-totals td.total.comma-separated').text()} bytes (${$('#service-totals td.total.abbreviated').text()})`]));
    csvData.push(csvFormat(["Average Total Origin Bandwidth:",`${$('#service-totals td.average.comma-separated').text()} bytes (${$('#service-totals td.average.abbreviated').text()})`]));
    csvData.push(csvFormat(["Average Divisor:",`${apiData.average_divisor}`]));
    csvData.push(csvFormat(["Bandwidth Adjusted for Shielding:",`${(apiData.shielding_multiplier==1)?"No":"Yes"}`]));
    csvData.push(csvFormat(["Date Range:",`${$('#fromDate').val()} to ${$('#toDate').val()}`]));
    csvData.push(csvFormat(["Days of Data:",`${$('#elapsedDays').val()}`]));
  }
  
  return(csvData.join('\n'));
}
var textFile = null;
function makeTextFile(text) {
  var data = new Blob([text], {type: 'text/plain'});

  // If we are replacing a previously generated file we need to
  // manually revoke the object URL to avoid memory leaks.
  if (textFile !== null) { window.URL.revokeObjectURL(textFile); }

  textFile = window.URL.createObjectURL(data);

  return textFile;
}
function exportData() {
  if ($('#service-data tbody tr').length == 0) {
    bootstrapAlert('Export Data Error','There is no data to export');
    return;
  }
  if ($('#service-data tbody tr td input:checked').length == 0) {
    bootstrapAlert('Export Data Error','There are no services selected');
    return;
  }
  $('#hiddenDownloadLink').attr("href", makeTextFile( getCsvData() ));
  $('#hiddenDownloadLink')[0].click();
}
function clearData() {
  progressBar.resetAll();
  $('#service-data tbody').html('');
  $('#output').html('');
  updateServiceTotals(0,0,true);
  $('.input-id-type-dependent:read-only').val('');
}
function changeBytesFormat() {
  apiData.bytes_format = $('#bytesFormat').val();
  $(document.body).attr('bytes-format',apiData.bytes_format);
  ["abbreviated","comma-separated","integer"].forEach(function(bytesFormat) {
    if (bytesFormat == apiData.bytes_format) {
      $(`.${bytesFormat}`).attr('csv','');
    } else {
      $(`.${bytesFormat}`).removeAttr('csv');
    }
  });
}
function updateRowBandwidthValues(rowSelector,totalBytes) {
  let shieldingMultiplier = 1;
  if (typeof totalBytes == "undefined") {
    totalBytes = Number( $(`${rowSelector} .total.integer`).attr('total-bytes') );
    if ($('#shieldingMultiplier').val() != "1" && $(`${rowSelector} .shielding`).text() != "") {
      shieldingMultiplier = Number( $('#shieldingMultiplier').val() );
    }
  }
  let adjustedBytes = Math.round( totalBytes * shieldingMultiplier );
  
  $(`${rowSelector} .total.integer`).text( adjustedBytes );
  $(`${rowSelector} .total.abbreviated`).text( byteFormat(adjustedBytes) );
  $(`${rowSelector} .total.comma-separated`).text( commaFormat(adjustedBytes) );
  
  let averageAdjustedBytes = Math.round( adjustedBytes / apiData.average_divisor );
  
  $(`${rowSelector} .average.integer`).text( averageAdjustedBytes );
  $(`${rowSelector} .average.abbreviated`).text( byteFormat(averageAdjustedBytes) );
  $(`${rowSelector} .average.comma-separated`).text( commaFormat(averageAdjustedBytes) );
}
function updateSelectedServices(e) {
  if (typeof e !== "undefined") {
    if(e.parentElement.tagName == "TH") {
      $( 'td .select-service' ).prop('checked',$( 'th .select-service' ).prop('checked'));
    }
  }
  let newCount = 0, newBytes = 0;;
  $( 'td .select-service:checked' ).each(function(){
    ++newCount;
    let className = this.parentElement.parentElement.className;
    let bShielding = ($(`#service-data tbody tr.${className} td.shielding`).text()!="");
    let shieldingMultiplier = parseFloat((bShielding) ? apiData.shielding_multiplier : 1);
    newBytes += Math.round(parseInt($(`#service-data tbody tr.${className} td.total.integer`).attr('total-bytes'))*shieldingMultiplier);
  });
  $('#service-totals td.count').text( newCount );
  updateRowBandwidthValues('#service-totals tbody',newBytes);
}
function updateDataTables() {
  $('#service-data tbody td.total.integer').each(function(){
    let rowClass = $(this).parent().attr('class');
    updateRowBandwidthValues(`#service-data tbody .${rowClass}`);
  });
  
  updateSelectedServices();
}
function updateShieldingMultiplier() {
  apiData.shielding_multiplier = parseFloat($('#shieldingMultiplier').val());
  updateDataTables();
}
function updateAverageDivisor() {
  apiData.average_divisor = Number($('#averageDivisor').val());
  updateDataTables();
}
function initializeAverageDivisor() {
  const selector = '#averageDivisor';
  const oninput_function = function() {
    (validity.valid && value!='') || (value=this.getAttribute('last-value'));
    this.setAttribute('last-value',value);
  };
  // Convert function to a string, extract its code, and then assign it to the "oninput" attribute
  $(selector).attr("oninput",oninput_function.toString().replace(/^[^{]+{\s*([\s\S]+?)\s*}$/,"$1"));
  $(selector).attr('last-value',$(selector).val());
}
function addServiceData(arrData) {
  let eTr = document.createElement("tr"),
      eTd = document.createElement("td"),
      eInput = document.createElement("input");
  eInput.type = 'checkbox';
  eInput.checked = true;
  eInput.className = 'select-service';
  eInput.disabled = true;
  $( eInput ).click(function() { updateSelectedServices(this); });
  eTd.appendChild(eInput);
  eTr.appendChild(eTd);
  arrData.forEach(function(datum,index){
    eTd = document.createElement("td");
    $(eTd).text(datum.value);
    eTd.className = datum.name;
    if (datum.name == "total integer") eTd.setAttribute('total-bytes', datum.value);
    if (datum.csv) eTd.setAttribute('csv','');
    eTr.appendChild(eTd);
  });
  eTr.className = `row${document.querySelectorAll('#service-data tbody tr').length}`;
  $('#service-data tbody')[0].appendChild(eTr);
}
function updateServiceTotals(count, bytes, reset) {
  reset = (typeof reset === "boolean") ? reset : false;
  let newCount = count + ((reset) ? 0 : Number($('#service-totals td.count').text()));
  $('#service-totals td.count').text( newCount );
  let newBytes = bytes + ((reset) ? 0 : Number($('#service-totals td.total.integer').text()));
  updateRowBandwidthValues('#service-totals tbody',newBytes);
}

var progressBar = {
  config: {
    customer: {selector: '.customer-progress-bar'},
  },
  steps: { customer: 1 },
  step: { customer: 0 },
  update: function(progressBarName, newStep) {
    if (typeof newStep !== "undefined") this.step[progressBarName] = newStep;
    if (!(progressBarName in this.config)) throw new Error(`progressBar(): Type "${progressBarName}" not found in configuration"`);
    if (!(progressBarName in this.steps) || !(progressBarName in this.step)) throw new Error(`progressBar(): Type "${progressBarName}" not initialized"`);
    if (typeof newStep === "undefined") this.step[progressBarName]++;
    let progress = Math.round(100*this.step[progressBarName]/this.steps[progressBarName]), selector = this.config[progressBarName].selector;
    if (progress==100)
      $(selector).removeClass('progress-bar-animated');
    else
      $(selector).addClass('progress-bar-animated');
    $(selector).attr('style',`width:${progress}%`).html(`${progress}%`);
  },
  reset: function(progressBarName) {
    if (!(progressBarName in this.step)) throw new Error(`progressBar(): Type "${progressBarName}" not initialized"`);
    this.update(progressBarName, 0);
  },
  resetAll: function() {
    var self = this;
    Object.keys(this.step).forEach(function(progressBarName) {
      self.reset(progressBarName);
    });
  },
  init: function(progressBarName,steps) {
    if (typeof steps === "undefined") {
      if (progressBarName in this.steps) return this.steps[progressBarName];  
      throw new Error(`progressBar(): Type "${progressBarName}" not initialized"`);
    }
    this.steps[progressBarName] = steps;
    this.step[progressBarName] = 0;
  }
}

function disableControlsWhileGettingData(bGettingData) {
  "select,input".split(",").forEach(function(tag) {
    $( `.user-inputs ${tag}` ).prop('disabled', bGettingData);
    if (bGettingData) {
      $( `.user-inputs ${tag}` ).parent().parent().addClass(`pseudo-disabled`);
    } else {
      $( `.user-inputs ${tag}` ).parent().parent().removeClass(`pseudo-disabled`);
    }
  });
  $( '#service-data input' ).prop('disabled', bGettingData);
  if (bGettingData) {
    $( '.normally-not-hidden' ).hide();
    $( '#halt-get-data' ).fadeIn();
  } else {
    $( '#halt-get-data' ).hide();
    $( '.normally-not-hidden' ).fadeIn();
  }
}
function stateTransition(state,nextState) {
  let fieldName = '';
  if ($('#kill-switch').prop("checked")) {
    $('#kill-switch').prop("checked",false);
    $('[data-dismiss="modal"]').click(function(){
      stateTransition(-2);
      $('[data-dismiss="modal"]').off('click');
    })
    bootstrapAlert('Getting Data Halted','All data collection and processing has been stopped');
    return;  
  }
  if (typeof state == "undefined") {
    state = -1;
  } else {
    nextState = (typeof nextState == "undefined") ? (state+1) : nextState;
  }
  /*
  console.group(`stateTransition( state = ${state}, nextState = ${nextState} )`);
  console.log(`${JSON.stringify(apiData,null,"  ")}`);
  console.groupEnd();
  */
  switch(state) {
    case -2:
      disableControlsWhileGettingData(false);
      return;
    case -1:
      progressBar.resetAll();
      disableControlsWhileGettingData(false);
      return;
    case 0:
      progressBar.init("customer", 1);
      statData = {totals:{},stats:{},data:{}};
      clearData();
      if (DEBUG) console.log(`${state}: Initializing general variables...`);
      disableControlsWhileGettingData(true);
      apiData.api_key = $('#apiKey').val();
      apiData.from_date = $('#fromDate').val();
      apiData.to_date = $('#toDate').val();
      apiData.shielding_multiplier = parseFloat($('#shieldingMultiplier').val());
      svcData=[];
      getUserInfo(nextState);
      return;
    case 1:
      if (DEBUG) console.log(`${state}: Getting Service info...`);
      apiData.id_type = $('#idType').val()
      switch(apiData.id_type) {
        case "customer":
          progressBar.init("customer", null);
          if (apiData.user_role == "billing") {
            $('#kill-switch').prop("checked",false);
            $('[data-dismiss="modal"]').click(function(){
              stateTransition(-2);
              $('[data-dismiss="modal"]').off('click');
            });
            bootstrapAlert('Insuffient Privileges','The supplied API Key has a "billing" User Role which cannot be used with the "Customer ID" Input ID Type');
            return; 
          }
          apiData.customer_id = $('#customerId').val();
          getCustomerServices(nextState);
          break;
        case "service":
          apiData.service_id = $('#serviceId').val();
          getServiceInfo(nextState);
          break;
        default:
          throw new Error(`Unknown ID Type: ${apiData.id_type}`);          
      }
      return;
    case 2:
      if (DEBUG) console.log(`${state}: Initializing Service variables...`);
      if (progressBar.init("customer") == null) progressBar.init("customer", svcData.length);
      let tmpSvcData = svcData.shift();
      $('#serviceName').val(tmpSvcData.service_name);
      if (apiData.id_type == "customer") {
        apiData.service_id = tmpSvcData.service_id;
        $('#serviceId').val(apiData.service_id);
      }
      statData.stats[apiData.service_id] = {};
      statData.totals[apiData.service_id] = {};
      statData.totals[apiData.service_id].service_name = tmpSvcData.service_name;
      stateTransition(nextState);
      return;
    case 3:
      if (DEBUG) console.log(`${state}: Making Parallel API Calls...`);
      apiCallCounter = 3;
      if ($('#customerName').val() == "") {
        apiCallCounter++;
        getCustomerInfo(nextState);
      }
      getServiceStats('shield_resp_header_bytes',nextState);
      getServiceStats('bereq_header_bytes',nextState);
      getServiceStats('bereq_body_bytes',nextState);
      return;
    case 4:
      --apiCallCounter;
      if (apiCallCounter != 0) return;
      stateTransition(nextState);
      return;
    case 5:
      if (apiCallCounter != 0) return;
      if (DEBUG) console.log(`${state}: Post-processing data...`);
      let oStats = statData.stats[apiData.service_id],
          oTotals = statData.totals[apiData.service_id];
      
      oTotals.shielding = (oStats.shield_resp_header_bytes > 0);
      
      addServiceData([
        {name: "service-id", value: apiData.service_id, csv: true},
        {name: "service-name", value: oTotals.service_name, csv: true},
        {name: "total integer", value: (oStats.bereq_header_bytes + oStats.bereq_body_bytes)},
        {name: "total abbreviated", value: ""},
        {name: "total comma-separated", value: ""},
        {name: "average integer", value: ""},
        {name: "average abbreviated", value: ""},
        {name: "average comma-separated", value: ""},
        {name: "shielding", value: ((oTotals.shielding) ? "X" : ""), csv: true},
      ]);
      let rowSelector = `#service-data tbody .row${document.querySelectorAll('#service-data tbody tr').length - 1}`;
      
      updateRowBandwidthValues( rowSelector );
      $('#bytesFormat').change();
      
      updateServiceTotals(1, Number( $( `${rowSelector} .total.integer` ).text() ));
      
      oTotals.total_bytes = Number( $( `${rowSelector} .total.integer` ).text() );
      oTotals.fmt_total_bytes = $( `${rowSelector} .total.comma-separated` ).text();
      oTotals.abbr_total_bytes = $( `${rowSelector} .total.abbreviated` ).text();
      $('#output').html(JSON.stringify(oTotals,null,"  "));
      
      stateTransition(999);
      return;
    case 999:
      progressBar.update("customer");
      if (svcData.length>0) {
        if (DEBUG) console.log(`-: Not Done Yet...`);
        stateTransition(2);
      } else {
        if (DEBUG) console.log(`-: Done`);
        setTimeout(()=>{
          disableControlsWhileGettingData(false);
        },1000);
      }
      return;
    default:
      bootstrapAlert("Internal Error in stateTransition()", `Unknown state: "${state}"`);
      return;
  }
}

function checkInputs(e) {
  const x = {serviceId:"serviceName",customerId:"customerName",apiKey:"userRole"};
  if (typeof e !== "undefined") { 
    if (e.id in x) $( `#${x[e.id]}` ).val('');
  }
  if ($('.bad-input').length != 0) {
    $( '#get-data' ).prop('disabled', true);
    return;
  }
  let bAllInputsPopulated = true;
  //console.group("checkInputs()");
  $( '.required-input' ).each(function(){
    bAllInputsPopulated = bAllInputsPopulated && /^\S+$/.test($(this).val());
    //console.log(`$(this).attr('id')`);
  });
  $( '#get-data' ).prop('disabled', !bAllInputsPopulated);
  //console.groupEnd();
}

function checkDates(e) {
  if (elapsedDays() < 1) {
    bootstrapAlert('Bad date',`The "From Date" must come before the "To Date"`);
    setTimeout(function(e) { $(e).datepicker("setDate", newDate($(e).attr('previous-value'), true)); }, 1, e);
  } else {
    $(e).attr("previous-value",$(e).val());
  }
  $('#elapsedDays').val(elapsedDays());
}

function changeInputIdType() {
  let selectedValue = $('#idType').val();
  if ('user_role' in apiData) {
    if (apiData.user_role == "billing" && selectedValue != "service") {
      bootstrapAlert('Insuffient Privileges','The supplied API Key has a "billing" User Role which cannot be used with the "Customer ID" Input ID Type');
      $('#idType').val('service')
      return
    }
  }
  ["service","customer"].forEach(function(idType) {
    let bMatch = idType==selectedValue, selector = `#${idType}Id`;
    $(selector).prop('readonly',!bMatch);
    if (bMatch) {
      $(selector).attr('name','username')
      $(selector).addClass(`required-input`);
      $(selector).change(function() { checkInputs(this); }).keyup(function() { checkInputs(this); });
      $(selector).parent().parent().removeClass(`pseudo-readonly`);
    } else {
      $(selector).removeAttr('name')
      $(selector).removeClass(`required-input`);
      $(selector).off("change").off("keyup");
      $(selector).parent().parent().addClass(`pseudo-readonly`);
    }
  });
  checkInputs(document.querySelector('#idType'));
}
function sortTableData(field,order) {
  if ($('#service-data thead th input.select-service:disabled').length==1) return;
  /* https://www.sitepoint.com/sort-an-array-of-objects-in-javascript/ */
  function compareValues(key, order='asc') {
    return function(a, b) {
      if(!a.hasOwnProperty(key) || !b.hasOwnProperty(key)) { return 0; }

      const varA = (typeof a[key] === 'string') ? a[key].toUpperCase() : a[key];
      const varB = (typeof b[key] === 'string') ? b[key].toUpperCase() : b[key];

      let comparison = 0;
      if (varA > varB) {
        comparison = 1;
      } else if (varA < varB) {
        comparison = -1;
      }
      return ( (order == 'desc') ? (comparison * -1) : comparison );
    };
  }
  const config = {
    orders: ["asc","desc"],
    fields: ["service-id","service-name","origin-bandwidth","shielding"],
  };
  if (!(config.fields.includes(field))) throw new Error(`sortTableData(): Unknown field "${field}"`);
  if (typeof order == "undefined") order = "asc";
  if (!(config.orders.includes(order))) throw new Error(`sortTableData(): Unknown order "${order}"`);
  let tblData = [];
  $('#service-data tbody tr').each(function(){
    let className = $(this).attr('class');
    tblData.push( {
      "class": className,
      "service-id": $(`#service-data tbody tr.${className} td.service-id`).text(),
      "service-name": $(`#service-data tbody tr.${className} td.service-name`).text(),
      "origin-bandwidth": Number($(`#service-data tbody tr.${className} td.total.integer`).text()),
      "shielding": $(`#service-data tbody tr.${className} td.shielding`).text(),
    } );
  });
  tblData.sort(compareValues(field,order));
  tblData.forEach(function(o){ $('#service-data tbody').append( $(`#service-data tbody tr.${o.class}`) ); });
}
function addSortLinks() {
  const tblSelector = '#service-data';
  $( `${tblSelector} thead th[sort-field]` ).each(function() {
    $( this ).append($("<a>", {"class":"sort-link ", "sort-direction": "asc"}));
    $( this ).append($("<a>", {"class":"sort-link ", "sort-direction": "desc"}));
  });
  $( `${tblSelector} thead th[sort-field] a[sort-direction="asc"]` ).each(function() {
    $( this ).html('&#8679;');
    $( this ).prop('title','Sort column data in ascending order');
  });
  $( `${tblSelector} thead th[sort-field] a[sort-direction="desc"]` ).each(function() {
    $( this ).html('&#8679;');
    $( this ).prop('title','Sort column data in descending order');
  });
  $( `${tblSelector} thead th[sort-field] a.sort-link` ).each(function() {
    $( this ).click(function(){
      sortTableData(this.parentElement.getAttribute('sort-field'),this.getAttribute('sort-direction'));
    });
  });
}