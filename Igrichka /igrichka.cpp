#include <iostream>
#include<vector>
using namespace std;
class Entity;
enum Rarity{
        Common,
        Rare,
        Epic,
        Legendary
    };
class Item{
    public:
    
    string name;
    int amount;
    const int stack;
    Item() : stack(0){
        this->amount = 0;
       
    }
    virtual void use(Entity* entity){

    }

};

class equipebleItem : public Item{
    Rarity rarity;
    void use(Entity* entity){

    }
    virtual void effects(){
        
    }
};

class Entity{
    public:
    int maxHp;
    int currHp;
    int dmg;
    vector < equipebleItem > equipment;
    Entity(){
        int maxHp = 0;
        int currHp = 0;
        int dmg = 0;
    }
    Entity(int maxHp, int dmg,vector<equipebleItem> equip){
        maxHp = this->maxHp;
        currHp = this->maxHp;
        for(int i = 0; i < equip.size(); i++){
            equipment.push_back(equip[i]);
        }
    }
    void TakeDamage(int dmg){
        this->currHp -= dmg;
        if(currHp < 0){
            cout << "You are dead";
        }
    }

};
class Player : public Entity{


};

class Enemy : public Entity{


};
