#include "../DurableQueue.h"
#include <cassert>
#include <map>
#include <set>
#include <iostream>
struct Memory : tcpqueue::Storage {
 std::map<std::string,std::string> disk;bool failWrite=false,failRemove=false;
 std::vector<std::string> files() override{std::vector<std::string> names;for(auto &p:disk)if(p.first.rfind("/q/",0)==0)names.push_back(p.first);return names;}
 bool read(const std::string &name,std::string &value) override{if(!disk.count(name))return false;value=disk[name];return true;}
 bool atomicWrite(const std::string &name,const std::string &value) override{if(failWrite){failWrite=false;return false;}disk[name]=value;return true;}
 bool remove(const std::string &name) override{if(failRemove){failRemove=false;return false;}return disk.erase(name)==1;}
 size_t usedBytes() override{size_t size=0;for(auto &p:disk)size+=p.second.size();return size;}
};
int main(){
 Memory store;tcpqueue::DurableQueue first(store,2,20000);
 assert(first.enqueue("0001",{{1,"temp"},{2,"gas"}}));
 assert(!first.drainOne([](auto,const auto&){return false;}));assert(store.disk.size()==1);
 tcpqueue::DurableQueue afterReset(store,2,20000);std::vector<unsigned long> attempts;
 assert(!afterReset.drainOne([&](auto id,const auto&){attempts.push_back(id);return id==1;}));
 assert((attempts==std::vector<unsigned long>{1,2}));
 attempts.clear();assert(afterReset.drainOne([&](auto id,const auto&){attempts.push_back(id);return true;}));assert((attempts==std::vector<unsigned long>{2}));assert(store.disk.empty());
 assert(first.enqueue("0002",{{1,"temp"},{2,"gas"}}));store.failWrite=true;
 assert(!first.drainOne([](auto,const auto&){return true;}));
 std::set<unsigned long> unique;int calls=0;
 assert(afterReset.drainOne([&](auto id,const auto&){unique.insert(id);++calls;return true;}));assert(calls==2 && unique.size()==2);
 assert(first.enqueue("0003",{{1,"a"}}));assert(first.enqueue("0004",{{2,"b"}}));assert(!first.enqueue("0005",{{3,"c"}}));
 assert(!first.enqueue("../escape",{{1,"x"}}));assert(!first.enqueue("bad",{{1,"newline\n"}}));
 store.disk.clear();store.disk["/q/0000corrupt.pkt"]="TCPQ1\n1|incomplete";assert(first.enqueue("0007",{{1,"after-corrupt"}}));int sent=0;
 assert(first.drainOne([&](auto,const auto&){++sent;return true;}));assert(sent==0);
 assert(store.disk.count(tcpqueue::QUARANTINE_PATH)==1 && first.drainOne([&](auto,const auto&){++sent;return true;}));
 assert(sent==1 && store.files().empty());
 store.disk.clear();assert(first.enqueue("0008",{{1,"rejected"},{2,"accepted"}}));std::vector<unsigned long> delivered;
 assert(first.drainOne([&](auto id,const auto&){delivered.push_back(id);return id==1?tcpqueue::SendResult::Reject:tcpqueue::SendResult::Sent;}));
 assert((delivered==std::vector<unsigned long>{1,2}) && store.files().empty());
 assert(first.enqueue("0009",{{1,"later"}}));
 assert(!first.drainOne([](auto,const auto&){return tcpqueue::SendResult::Retry;}));assert(store.files().size()==1);
 store.disk.clear();assert(first.enqueue("0006",{{1,"retry"}}));store.failRemove=true;
 assert(!first.drainOne([](auto,const auto&){return true;}));assert(store.disk.size()==1);
 assert(afterReset.drainOne([](auto,const auto&){return true;}));assert(store.disk.empty());
 std::cout<<"durable queue: reset, retry, partial ACK, failed writes/removal, bounds, corruption quarantine and rejection tests passed\n";
}
