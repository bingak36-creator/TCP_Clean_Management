#pragma once
#include <algorithm>
#include <cstdlib>
#include <string>
#include <vector>

namespace tcpqueue {
struct Reading { unsigned long sensorId; std::string payload; };
// Reject: the server refused this reading for good; retrying would block every later packet.
enum class SendResult { Sent, Retry, Reject };
inline SendResult toResult(bool sent){return sent?SendResult::Sent:SendResult::Retry;}
inline SendResult toResult(SendResult result){return result;}
// Single slot outside /q, so the newest corrupt packet stays for diagnosis without being drained again.
static const char *const QUARANTINE_PATH="/qbad.pkt";
struct Storage {
  virtual ~Storage() = default;
  virtual std::vector<std::string> files() = 0;
  virtual bool read(const std::string &, std::string &) = 0;
  virtual bool atomicWrite(const std::string &, const std::string &) = 0;
  virtual bool remove(const std::string &) = 0;
  virtual size_t usedBytes() = 0;
};
class DurableQueue {
  Storage &storage; size_t maxPackets, maxBytes;
public:
  DurableQueue(Storage &s,size_t packets=720,size_t bytes=768*1024):storage(s),maxPackets(packets),maxBytes(bytes){}
  static std::string encode(const std::vector<Reading> &rows) {
    std::string value="TCPQ1\n";
    for(const auto &r:rows)value+=std::to_string(r.sensorId)+"|"+r.payload+"\n";
    return value;
  }
  static bool decode(const std::string &value,std::vector<Reading> &rows) {
    rows.clear();if(value.compare(0,6,"TCPQ1\n")!=0 || value.empty() || value.back()!='\n')return false;
    size_t start=6;
    while(start<value.size()){
      size_t end=value.find('\n',start), separator=value.find('|',start);
      if(end==std::string::npos || separator==std::string::npos || separator>=end || separator==start || end-separator<=1 || end-separator>4096)return false;
      std::string number=value.substr(start,separator-start);char *rest=nullptr;unsigned long id=std::strtoul(number.c_str(),&rest,10);
      if(!id || !rest || *rest || number.find_first_not_of("0123456789")!=std::string::npos)return false;
      rows.push_back({id,value.substr(separator+1,end-separator-1)});if(rows.size()>3)return false;start=end+1;
    }
    return !rows.empty();
  }
  bool hasCapacity(){return storage.files().size()<maxPackets && storage.usedBytes()+8192<maxBytes;}
  bool enqueue(const std::string &id,const std::vector<Reading> &rows){
    if(rows.empty() || rows.size()>3 || id.empty() || id.size()>80 || id.find_first_not_of("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-")!=std::string::npos)return false;
    for(const auto &row:rows)if(!row.sensorId || row.payload.empty() || row.payload.size()>4096 || row.payload.find('\n')!=std::string::npos)return false;
    auto encoded=encode(rows);auto name="/q/"+id+".pkt";
    auto files=storage.files();if(std::find(files.begin(),files.end(),name)!=files.end())return false;
    if(files.size()>=maxPackets || storage.usedBytes()+encoded.size()*2>maxBytes)return false;
    return storage.atomicWrite(name,encoded);
  }
  template<typename Send> bool drainOne(Send send){
    auto files=storage.files();if(files.empty())return true;std::sort(files.begin(),files.end());
    std::string value;if(!storage.read(files.front(),value))return false;
    std::vector<Reading> rows;
    if(!decode(value,rows))return storage.atomicWrite(QUARANTINE_PATH,value) && storage.remove(files.front());
    while(!rows.empty()){
      if(toResult(send(rows.front().sensorId,rows.front().payload))==SendResult::Retry)return false;
      rows.erase(rows.begin()); // sent, or rejected for good by the server
      if(rows.empty())return storage.remove(files.front());
      if(!storage.atomicWrite(files.front(),encode(rows)))return false;
    }
    return true;
  }
};
}
