var NGTOBuilderVersion = "1.12";

//MCTE
importPackage(Packages.jp.ngt.mcte.item);//ItemMiniature

//NGTLib
importPackage(Packages.jp.ngt.ngtlib.util);//NGTUtilClient MCWrapper NGTUtil
importPackage(Packages.jp.ngt.ngtlib.io);//NGTLog
importPackage(Packages.jp.ngt.ngtlib.math);//Vec3
importPackage(Packages.jp.ngt.ngtlib.block);//BlockUtil TileEntityCustom

//RealTrainMod
importPackage(Packages.jp.ngt.rtm);//RTMCore RTMBlock RTMItem RTMResource
importPackage(Packages.jp.ngt.rtm.item);//ItemInstalledObject
importPackage(Packages.jp.ngt.rtm.rail);//TileEntityLargeRailBase
importPackage(Packages.jp.ngt.rtm.electric);//TileEntityInsulator BlockInsulator TileEntityConnectorBase
importPackage(Packages.jp.ngt.rtm.modelpack.state);//ResourceState

//Minecraft
importPackage(Packages.net.minecraft.block);//Block BlockStairs BlockDoor BlockOldLog BlockNewLog
importPackage(Packages.net.minecraft.init);//Blocks
importPackage(Packages.net.minecraft.nbt);//NBTTagCompound


var isOldVer = RTMCore.VERSION.indexOf("1.7.10") >= 0;
var isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;
//var hostPlayerList = new java.util.HashMap();
var buildNGTO = new java.util.HashMap();
var buildDataList = new java.util.HashMap();
var undoBlockListMap = new java.util.HashMap();

function onUpdate(entity, scriptExecuter) {
    entity.field_70177_z = 0;

    var dataMap = entity.getResourceState().getDataMap();
    var world = entity.field_70170_p;
    var hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
    var hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.func_73045_a(hostPlayerEntityId);
    //var hostPlayer = hostPlayerList.get(entity);//entityIdから取得するようにする
    var rider = getRider(entity);
    //var ridingEntity = getRidingEntity(entity);
    var selectPosList = [];
    var selectPosList_JSON = dataMap.getString("selectPosList");
    var changeDisplay = dataMap.getBoolean("changeDisplay");
    if (selectPosList_JSON !== "") {
        selectPosList = JSON.parse(selectPosList_JSON.replace(/☆/g, ","));
        if (scriptExecuter.count % 20 === 0) {
            dataMap.setString("selectPosList", selectPosList_JSON, 3);
            dataMap.setBoolean("changeDisplay", changeDisplay, 3);
        }
    }

    if (dataMap.getString("VERSIONS") === "") {
        dataMap.setString("VERSIONS", NGTOBuilderVersion, 1);
    }

    doFollowing(entity, hostPlayer);//1.12用

    if (!hostPlayer) {//ホストプレイヤー未登録
        if (rider) {
            //hostPlayerList.put(entity, rider);
            var playerEntityId = rider.func_145782_y();
            dataMap.setString("hostPlayerEntityId", playerEntityId, 1);
            dismountPlayer(entity);//プレイヤーを降ろす
            startRiding(entity, rider);//プレイヤーに乗る
        }
        else {
            dismount(entity);//プレイヤーから降りる
            if (selectPosList.length > 0) {
                var endPos = selectPosList[selectPosList.length - 1];
                entity.func_70107_b(endPos[0], endPos[1], endPos[2]);
            }
        }
    }
    else if (rider) {
        dismountPlayer(entity);//プレイヤーを降ろす
        dataMap.setBoolean("isEndEdit", true, 1);
    }
    else {//ホストプレイヤー登録済み
        var isEndEdit = dataMap.getBoolean("isEndEdit");

        //isEndEdit
        if (isEndEdit) {
            entity.func_70106_y();
        }
    }
}

//####  関数  ####
//# サーバーサイド #
function getRider(entity) {
    if (isOldVer) {
        return entity.field_70153_n;
    }
    else {
        var passengers = entity.func_184188_bt();
        var rider = passengers.size() > 0 ? passengers.get(0) : null;
        return rider;
    }
}

function getRidingEntity(entity) {
    if (isOldVer) {
        return entity.field_70154_o;
    }
    else {
        return entity.func_184187_bx();
    }
}

function startRiding(entity, targetEntity) {
    if (targetEntity) {
        if (isOldVer) entity.func_70078_a(targetEntity);
        //else entity.func_184220_m(targetEntity);
    }
}

function dismountPlayer(entity) {
    var rider = getRider(entity);
    if (rider) {
        if (isOldVer) rider.func_70078_a(null);
        else rider.func_184210_p();
    }
}

function dismount(entity) {
    if (isOldVer) entity.func_70078_a(null);
    else entity.func_184210_p();
}

//# 共通 #
function doFollowing(entity, hostPlayer) {
    if (!entity || !hostPlayer || isOldVer) return;
    var x = hostPlayer.field_70165_t;
    var y = hostPlayer.field_70163_u + 2;
    var z = hostPlayer.field_70161_v;

    entity.func_70107_b(x, y, z);

    entity.field_70159_w = 0;
    entity.field_70181_x = 0;
    entity.field_70179_y = 0;
}