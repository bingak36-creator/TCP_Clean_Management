export const SENSOR_TYPES = [
  {value:'TEMP_HUMID',label:'TEMP_HUMID (온습도 센서)'},
  {value:'GAS',label:'GAS (유해가스 센서)'},
  {value:'MAG',label:'MAG (도어 개폐 감지 센서)'}
];
export function facilityPayload(input) {
  const parse=value=>value==null||String(value).trim()===''?null:Number(value);
  const latitude=parse(input.latitude??input.lat),longitude=parse(input.longitude??input.lng);
  if((latitude==null)!=(longitude==null)||latitude!=null&&(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -90||latitude>90||longitude< -180||longitude>180))
    throw new Error('올바른 위도·경도 쌍을 입력해주세요.');
  const floor=input.floor&&input.floor!=='미등록'?String(input.floor).trim():null;
  const gender=input.gender&&input.gender!=='미등록'?String(input.gender).trim():null;
  if(floor&&!/^(B?[1-9][0-9]{0,2}F|RF|옥상)$/.test(floor))throw new Error('유효한 층수를 선택해주세요.');
  if(gender&&!['남','여','공용'].includes(gender))throw new Error('유효한 화장실 구분을 선택해주세요.');
  const raw=input.deviceId?.trim();
  if(raw&&!/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(raw))throw new Error('유효한 MAC 주소를 입력해주세요.');
  return {
    zone:{name:input.name,address:input.address??'',floor,gender,latitude,longitude,zoneType:input.zoneType||'TOILET',
      isOurSolution:input.isOurSolution??true,pleasantThreshold:input.pleasantThreshold??300,needsVentilationThreshold:input.needsVentilationThreshold??600,
      assignedWorkerId:input.assignedWorkerId??null},
    device:raw?{macAddress:raw.toUpperCase().replaceAll('-',':')}:null
  };
}
