//query to update delivery settings for a store

router.post("/delivery-settings", requireOwner, async (req, res) => {
    const { delivery_available, delivery_charge, min_order, pickup_available } = req.body;

    await db.query(
        `UPDATE stores 
         SET delivery_available=?, delivery_charge=?, min_order_free_delivery=?, pickup_available=? 
         WHERE owner_id=?`,
        [delivery_available, delivery_charge, min_order, pickup_available, req.auth.user.id]
    );

    res.json({ message: "Updated" });
});