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
var isFixRTM = !isOldVer ? Packages.net.minecraftforge.fml.common.Loader.isModLoaded("fix-rtm") : false;
var hostPlayerList = new java.util.HashMap();
var buildNGTO = new java.util.HashMap();
var buildDataList = new java.util.HashMap();
var undoBlockListMap = new java.util.HashMap();

function onUpdate(entity, scriptExecuter) {
    entity.field_70177_z = 0;

    var dataMap = entity.getResourceState().getDataMap();
    var world = entity.field_70170_p;
    var hostPlayer = hostPlayerList.get(entity);
    var rider = getRider(entity);
    var ridingEntity = getRidingEntity(entity);

    if (dataMap.getString("VERSIONS") === "") {
        dataMap.setString("VERSIONS", NGTOBuilderVersion, 1);
    }

    doFollowing(entity, hostPlayer);//1.12用

    if (!hostPlayer) {//ホストプレイヤー未登録
        if (rider) {
            hostPlayerList.put(entity, rider);
            var playerEntityId = rider.func_145782_y();
            dataMap.setString("hostPlayerEntityId", playerEntityId, 1);
            dismountPlayer(entity);//プレイヤーを降ろす
            startRiding(entity, rider);//プレイヤーに乗る
        }
        else if (ridingEntity) {
            hostPlayerList.put(entity, ridingEntity);
            var playerEntityId = ridingEntity.func_145782_y();
            dataMap.setString("hostPlayerEntityId", playerEntityId, 1);
            //初期化
            dataMap.setString("selectPosList", "[]", 1);
            dataMap.setBoolean("isUndo", false, 1);
            dataMap.setBoolean("isBuilding", false, 1);
            dataMap.setBoolean("buildComplete", false, 1);
        }
    }
    else if (rider) {
        dismountPlayer(entity);//プレイヤーを降ろす
        dataMap.setBoolean("isEndEdit", true, 1);
    }
    else {//ホストプレイヤー登録済み
        var isBuilding = dataMap.getBoolean("isBuilding");
        var isUndo = dataMap.getBoolean("isUndo");
        var selectPosList = [];
        var selectPosList_JSON = dataMap.getString("selectPosList");
        if (selectPosList_JSON !== "") selectPosList = JSON.parse(selectPosList_JSON.replace(/☆/g, ","));
        var isBuildComplete = dataMap.getBoolean("buildComplete");
        var undoBlockList = undoBlockListMap.get(entity);
        if (!undoBlockList) undoBlockList = [];
        var isEndEdit = dataMap.getBoolean("isEndEdit");

        //生成処理
        if (isBuilding && !isBuildComplete) {
            undoBlockList = [];
            var wireItem = getSelectedSlotItem(hostPlayer);
            if (wireItem.func_77973_b() === RTMItem.itemWire) {
                for (var i = 0; i < selectPosList.length; i++) {
                    var blockX = selectPosList[i][0];
                    var blockY = selectPosList[i][1];
                    var blockZ = selectPosList[i][2];
                    var blockSide = selectPosList[i][3];
                    var blockOffset = selectPosList[i][4];
                    var insulatorName = selectPosList[i][6];
                    var backupBlock = getBlock(world, blockX, blockY, blockZ);
                    var backupMetadata = getMetadata(world, blockX, blockY, blockZ);
                    var tileEntity = getTileEntity(world, blockX, blockY, blockZ);
                    try {
                        if (!(tileEntity instanceof TileEntityLargeRailBase)) {
                            //ブロックのバックアップ
                            var blockRotation = 0;
                            if (backupBlock instanceof TileEntityPlaceable) blockRotation = backupBlock.getRotation();
                            if (!backupBlock) backupBlock = Blocks.field_150350_a;
                            if (!backupMetadata) backupMetadata = 0;
                            var backupNBT = null;
                            //RTM系ブロックをバックアップするときサーバー側でクラッシュすることがある
                            try{
                                if (isOldVer) {
                                    if (backupBlock.func_145841_b) {
                                        backupNBT = new NBTTagCompound();
                                        backupBlock.func_145841_b(backupNBT);
                                    }
                                }
                                else {
                                    if (backupBlock.func_189515_b) {
                                        backupNBT = new NBTTagCompound();
                                        backupBlock.func_189515_b(backupNBT);
                                    }
                                }
                            }
                            catch(e){
                                NGTLog.debug("[NGTO Builder] Backup error");
                                NGTLog.debug(e);
                                NGTLog.debug("----------");
                                NGTLog.debug("pos: " + blockX + ", " + blockY + ", " + blockZ);
                                NGTLog.debug("backupBlock: " + backupBlock);
                                NGTLog.debug("----------");
                            }
                            undoBlockList.push([new BlockSet(backupBlock, backupMetadata, backupNBT), blockX, blockY, blockZ, blockRotation]);
                            undoBlockListMap.put(entity, undoBlockList);

                            //碍子の設置
                            if (!(tileEntity instanceof TileEntityInsulator)) {
                                setBlock(world, blockX, blockY, blockZ, RTMBlock.insulator, blockSide);
                                tileEntity = getTileEntity(world, blockX, blockY, blockZ);
                                setModelName(tileEntity, insulatorName);
                                //KaizPatch or fixRTMのときはoffsetを適用する
                                if (isKaizPatch || isFixRTM) {
                                    tileEntity.setOffset(blockOffset[0], blockOffset[1], blockOffset[2], true);
                                }
                            }

                            //ワイヤーを張る
                            if (i > 0 && tileEntity instanceof TileEntityInsulator) {
                                var prevPos = selectPosList[i - 1];
                                setConnectionTo(tileEntity, prevPos, wireItem);
                            }
                        }
                    }
                    catch (e) {
                        NGTLog.debug("[NGTO Builder] Error occurred");
                        NGTLog.debug(e);
                        NGTLog.debug("----------");
                        NGTLog.debug("pos: " + blockX + ", " + blockY + ", " + blockZ);
                        NGTLog.debug("----------");
                    }
                }
            }
            dataMap.setBoolean("buildComplete", true, 1);
        }
        //undo
        if (isUndo && !isBuildComplete) {
            for (var i = 0; i < undoBlockList.length; i++) {
                var blockSet = undoBlockList[i][0];
                var block = blockSet.block;
                var metadata = blockSet.metadata;
                var undoX = undoBlockList[i][1];
                var undoY = undoBlockList[i][2];
                var undoZ = undoBlockList[i][3];
                var undoYaw = undoBlockList[i][4];
                try {
                    if (!(block instanceof BlockInsulator)) {
                        //ブロックのセット
                        setBlock(world, undoX, undoY, undoZ, block, metadata, 2);
                        if (block instanceof BlockDoor) {
                            var upSideDoorMetaData = 8;
                            setBlock(world, undoX, undoY + 1, undoZ, block, upSideDoorMetaData, 2);
                        }
                        if (hasTileEntity(blockSet) ||
                            (block.func_149716_u && block.func_149716_u())) {
                            var tile = getTileEntity(world, undoX, undoY, undoZ);
                            if (tile) setTileEntityData(tile, blockSet, undoX, undoY, undoZ, undoYaw);
                        }
                    }
                }
                catch (e) {
                    NGTLog.debug("[NGTO Builder] Error occurred (undo)");
                    NGTLog.debug(e);
                    NGTLog.debug("----------");
                    NGTLog.debug("pos: " + blockX + ", " + blockY + ", " + blockZ);
                    NGTLog.debug("----------");
                }
            }
            undoBlockListMap.put(entity, null);
            dataMap.setBoolean("buildComplete", true, 1);
        }
        //isEndEdit
        if (isEndEdit) {
            entity.func_70106_y();
        }
    }
}

//####  関数  ####
//# サーバーサイド #
function setModelName(tileEntity, name) {
    if (isKaizPatch) {
        NGTUtil.setValueToField(TileEntityConnectorBase.class, tileEntity, name, "modelName");
        NGTUtil.setValueToField(TileEntityConnectorBase.class, tileEntity, null, "myModelSet");
        if (tileEntity.field_145850_b) {
            tileEntity.func_70296_d();
            tileEntity.field_145850_b.func_147471_g(tileEntity.field_145851_c, tileEntity.field_145848_d, tileEntity.field_145849_e);
        }
    }
    else {
        if (isOldVer) {
            tileEntity.setModelName(name);
        }
        else {
            tileEntity.getResourceState().setResourceName(name);
        }
    }
}

function setConnectionTo(tileEntity, prevPos, itemStack) {
    if (isOldVer) {
        var modelName = itemStack.func_77973_b().getModelName(itemStack);
        tileEntity.setConnectionTo(prevPos[0], prevPos[1], prevPos[2], Connection.ConnectionType.WIRE, modelName);
    }
    else {
        var resourceState = itemStack.func_77973_b().getModelState(itemStack);
        tileEntity.setConnectionTo(prevPos[0], prevPos[1], prevPos[2], Connection.ConnectionType.WIRE, resourceState);
    }
}

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

function setBlock(world, x, y, z, block, metadata) {
    var flag = 3;
    if (isOldVer) world.func_147465_d(x, y, z, block, metadata, flag);
    else BlockUtil.setBlock(world, x, y, z, block, metadata, flag)
}

function getBlock(world, x, y, z) {
    if (isOldVer) return world.func_147439_a(x, y, z);
    else return BlockUtil.getBlock(world, x, y, z);
}

function getMetadata(world, x, y, z) {
    if (isOldVer) return world.func_72805_g(x, y, z);
    else return BlockUtil.getMetadata(world, x, y, z);
}

function setTileEntityData(tile, blockSet, x, y, z, yaw) {
    var nbt = blockSet.nbt;
    //var metadata = blockSet.metadata;
    var prevX = 0;
    var prevY = 0;
    var prevZ = 0;
    if (nbt) {
        var _nbt = nbt.func_74737_b();
        prevX = _nbt.func_74762_e("x");
        prevY = _nbt.func_74762_e("y");
        prevZ = _nbt.func_74762_e("z");
        _nbt.func_74768_a("x", x);
        _nbt.func_74768_a("y", y);
        _nbt.func_74768_a("z", z);

        if (!isOldVer) {//モデル名変換処理
            var modelName = nbt.func_74779_i("ModelName");
            if (modelName) tile.getResourceState().setResourceName(modelName);
        }

        tile.func_145839_a(_nbt);
    }
    if (tile instanceof TileEntityCustom) {
        tile.setPos(x, y, z, prevX, prevY, prevZ);
    }
    else {
        if (isOldVer) {
            tile.field_145851_c = x;
            tile.field_145848_d = y;
            tile.field_145849_e = z;
        }
        else {
            tile.func_174878_a(new Packages.net.minecraft.util.math.BlockPos(x, y, z));
        }
    }
    if (tile instanceof TileEntityPlaceable) {
        //var rotation = tile.getRotation() + 90 + yaw;
        var rotation = tile.getRotation() + yaw;
        tile.setRotation(rotation, true);
    }
    if (tile instanceof BlockStairs) {

    }
}

//# 共通 #
function hasTileEntity(blockSet) {
    if (!blockSet || !blockSet.block) return false;

    var block = blockSet.block;
    try {
        if (block instanceof Packages.net.minecraft.block.ITileEntityProvider) return true;

        if (isOldVer) return block.hasTileEntity(blockSet.metadata);
        else return block.hasTileEntity(block.func_176203_a(blockSet.metadata));
    } 
    catch (err) {
        NGTLog.debug("[NGTO Builder] hasTileEntity Error: " + block + " -> " + err);
        return false;
    }
}

function getSelectedSlotItem(player) {
    var inventory = player.field_71071_by;
    var index = inventory.field_70461_c;
    if (isOldVer) return inventory.field_70462_a[index];
    else return inventory.field_70462_a.get(index);
}

function getTileEntity(world, x, y, z) {
    if (isOldVer) return world.func_147438_o(x, y, z);
    else {
        var blockPos = new Packages.net.minecraft.util.math.BlockPos(Math.floor(x), Math.floor(y), Math.floor(z));
        return world.func_175625_s(blockPos);
    }
}

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

function getItemType(itemStack) {
    if (isOldVer) {
        return itemStack.func_77973_b().getSubType(itemStack);
    }
    else {
        return itemStack.func_77973_b().getModelState(itemStack).type.subType;
    }
}